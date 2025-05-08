import * as FileSystem from "expo-file-system"
import "react-native-get-random-values"
import { v4 as uuidv4 } from "uuid"
// API configuration - must match your Firebase project and emulator ports
const API_BASE_URL = "http://10.0.58.233:9000/demo-docnote-e7f1e/us-central1/api"

// NGROK URL
// const API_BASE_URL = 'https://85c8-210-100-244-44.ngrok-free.app/docnote-e7f1e/us-central1/api';

// Production API URL (uncomment when deploying)
// const API_BASE_URL = 'https://us-central1-docnote-e7f1e.cloudfunctions.net/api';

// Add emulator flag for local development
const USING_EMULATOR = true
const CLIENT_ID = uuidv4()
console.log("Generated client ID:", CLIENT_ID)

// Utility function to append emulator query parameter
const getApiUrl = (endpoint: string, queryParams?: string): string => {
    const baseUrl = `${API_BASE_URL}${endpoint}`
    const emulatorParam = USING_EMULATOR ? "useEmulator=true" : ""

    if (queryParams) {
        // If there are query params and emulator param, combine them
        return `${baseUrl}?${emulatorParam}${
            queryParams.startsWith("?") ? queryParams.substring(1) : `&${queryParams}`
        }`
    }

    // Just the emulator param if no additional query params
    return USING_EMULATOR ? `${baseUrl}?${emulatorParam}` : baseUrl
}

// Maximum size for each chunk in bytes (25MB)
const MAX_CHUNK_SIZE = 25 * 1024 * 1024 // 25MB

// Cache for audio paths to avoid repeated lookups
const audioPathCache = new Map<string, string>()

// Function to ensure we have a full path to the audio file
export const getFullAudioPath = (audioUri: string | null | undefined): string => {
    // Use cache to avoid repeated lookups of the same empty URI
    const cacheKey = audioUri || "empty_uri"

    // If we've already processed this URI (or empty URI), return the cached result
    if (audioPathCache.has(cacheKey)) {
        return audioPathCache.get(cacheKey) || ""
    }

    // If no audio URI provided, try to find the most recent audio file
    if (!audioUri) {
        // Log once instead of repeatedly
        console.log("Received empty audio URI, will try to find available files")

        // Return empty string, but don't spam the console with errors
        // The actual file finding will happen in the Report/Player component
        const emptyResult = ""
        audioPathCache.set(cacheKey, emptyResult)
        return emptyResult
    }

    // Log for debugging
    console.log("getFullAudioPath input:", audioUri)

    // If it's already an absolute path, return it
    if (
        audioUri.startsWith("file://") ||
        (FileSystem.documentDirectory && audioUri.startsWith(FileSystem.documentDirectory))
    ) {
        console.log("Using absolute path:", audioUri)
        audioPathCache.set(cacheKey, audioUri)
        return audioUri
    }

    try {
        // Extract the filename (assuming it's the last part after /)
        const filename = audioUri.split("/").pop() || ""
        console.log("Extracted filename:", filename)

        // If filename is empty, try to use the full audioUri as the filename
        const safeFilename = filename || audioUri

        // Create an array of possible paths to try in order of preference
        const possiblePaths = [
            // Expo document directory path - most reliable
            FileSystem.documentDirectory ? `${FileSystem.documentDirectory}functions/audio/${safeFilename}` : null,
            // Direct project path as fallback
            `functions/audio/${safeFilename}`,
            // Simple audio directory
            `audio/${safeFilename}`,
            // Original URI as last resort
            audioUri
        ].filter(Boolean) as string[] // Remove null values

        // Log all paths we'll try
        console.log("Will try these paths in order:", possiblePaths)

        // For now, return the first path (most likely to exist)
        // The calling function will check for existence
        const result = possiblePaths[0]
        audioPathCache.set(cacheKey, result)
        return result
    } catch (error) {
        console.error("Error in getFullAudioPath:", error)
        // Return the original URI as a fallback if there's an error
        const fallback = audioUri
        audioPathCache.set(cacheKey, fallback)
        return fallback
    }
}

// Get file name and type from URI
const getFilenameFromUri = (uri: string): string => {
    const parts = uri.split("/")
    return parts[parts.length - 1] || "recording.m4a"
}

/**
 * Process audio file for transcription, including chunking if necessary
 * @param audioUri - URI of the audio file to process
 * @param keepLocalFiles - Whether to keep local files after processing
 * @returns Promise resolving to processing result
 */
export const processAudioForTranscription = async (audioUri: string, keepLocalFiles: boolean = true) => {
    try {
        // Convert to full path if needed
        const fullAudioPath = getFullAudioPath(audioUri)

        // Get audio file info
        const fileInfo = await FileSystem.getInfoAsync(fullAudioPath)
        console.log("Processing audio with full path:", fullAudioPath)
        console.log("File info:", fileInfo)

        if (!fileInfo.exists) {
            throw new Error(`Audio file does not exist at: ${fullAudioPath}`)
        }

        // Check if we need to chunk the file
        if (fileInfo.size && fileInfo.size > MAX_CHUNK_SIZE) {
            console.log(`Audio file is large (${fileInfo.size} bytes), chunking it`)
            return await chunkAndProcessAudio(fullAudioPath, fileInfo.size, keepLocalFiles)
        } else {
            // File is small enough to process directly
            console.log(`Audio file is small (${fileInfo.size} bytes), processing directly`)
            return await processAudioFile(fullAudioPath)
        }
    } catch (error) {
        console.error("Error processing audio file:", error)
        throw error
    }
}

/**
 * Chunk large audio file into smaller parts and process each chunk
 * @param audioUri - URI of the original audio file
 * @param fileSize - Size of the file in bytes
 * @param keepLocalFiles - Whether to keep local files after processing
 * @returns Promise resolving to processing results from all chunks
 */
const chunkAndProcessAudio = async (audioUri: string, fileSize: number, keepLocalFiles: boolean = true) => {
    try {
        // Calculate number of chunks needed
        const numChunks = Math.ceil(fileSize / MAX_CHUNK_SIZE)
        console.log(`Splitting audio into ${numChunks} chunks`)

        // Generate a unique session ID for this chunked upload
        const sessionId = `session_${Date.now()}_${Math.floor(Math.random() * 10000)}`
        console.log(`Created session ID: ${sessionId}`)

        // Get file name and type from URI
        const fileName = getFilenameFromUri(audioUri)
        const fileUriParts = audioUri.split(".")
        const fileType = fileUriParts[fileUriParts.length - 1] || "m4a"

        // Process each chunk
        let uploadResults = []
        let combinedTranscript = ""

        // Read the file directly as binary data for splitting
        const fileContent = await FileSystem.readAsStringAsync(audioUri, {
            encoding: FileSystem.EncodingType.Base64
        })

        // Calculate chunk size in base64 encoding (approximately 4/3 times larger)
        const base64ChunkSize = Math.floor(MAX_CHUNK_SIZE * 0.75)

        for (let i = 0; i < numChunks; i++) {
            console.log(`Processing chunk ${i + 1} of ${numChunks}`)

            // Calculate chunk boundaries in base64 string
            const start = i * base64ChunkSize
            const end = Math.min((i + 1) * base64ChunkSize, fileContent.length)
            const chunkContent = fileContent.substring(start, end)

            // Create a temporary file for this chunk
            const chunkFileName = `chunk_${i + 1}_${fileName}`
            const chunkUri = `${FileSystem.cacheDirectory}${chunkFileName}`

            // Write the chunk to a temporary file
            await FileSystem.writeAsStringAsync(chunkUri, chunkContent, {
                encoding: FileSystem.EncodingType.Base64
            })

            // Upload this chunk
            const result = await uploadChunk(chunkUri, chunkFileName, fileType, sessionId, i + 1, numChunks)

            uploadResults.push(result)

            // Append transcript from each chunk (if available)
            if (result.transcript) {
                combinedTranscript += result.transcript + " "
            }

            // Clean up temporary chunk file
            if (!keepLocalFiles) {
                await FileSystem.deleteAsync(chunkUri, { idempotent: true })
            }
        }

        // Request server to combine all chunks for final processing
        console.log("All chunks uploaded, finalizing processing")
        const finalResult = await finalizeChunkedUpload(sessionId, numChunks)

        // If the server successfully processed all chunks, return its result
        if (finalResult.success) {
            return finalResult
        }

        // Fallback: If server combination failed but we got individual transcripts
        if (combinedTranscript.trim().length > 0) {
            return {
                success: true,
                message: "Successfully processed audio chunks",
                transcript: combinedTranscript.trim(),
                recommendations: finalResult.recommendations || "",
                file: finalResult.file || uploadResults[0]?.file,
                recordingId: finalResult.recordingId || uploadResults[0]?.recordingId
            }
        }

        return {
            success: false,
            message: "Failed to process audio chunks"
        }
    } catch (error) {
        console.error("Error chunking audio file:", error)
        throw error
    }
}

/**
 * Upload a single audio chunk to the backend
 * @param chunkUri - URI of the chunk file
 * @param fileName - Name of the file
 * @param fileType - Type of the file
 * @param sessionId - Session ID for this chunked upload
 * @param chunkNumber - Current chunk number
 * @param totalChunks - Total number of chunks
 * @returns Promise resolving to processing result
 */
const uploadChunk = async (
    chunkUri: string,
    fileName: string,
    fileType: string,
    sessionId: string,
    chunkNumber: number,
    totalChunks: number
) => {
    try {
        console.log(`Uploading chunk ${chunkNumber}/${totalChunks}: ${fileName}`)

        // Prepare form data for file upload
        const formData = new FormData()

        // Add the audio chunk file to form data
        formData.append("audio", {
            uri: chunkUri,
            name: fileName,
            type: `audio/${fileType}`
        } as any)

        // Add metadata about the chunk
        formData.append("sessionId", sessionId)
        formData.append("chunkNumber", chunkNumber.toString())
        formData.append("totalChunks", totalChunks.toString())

        // Use the API URL for chunked audio upload
        const apiUrl = getApiUrl("/upload-audio-chunk")

        // Make the API request
        const response = await fetch(apiUrl, {
            method: "POST",
            body: formData,
            headers: {
                Accept: "application/json"
            }
        })

        // Check if the response is successful
        if (!response.ok) {
            const errorText = await response.text()
            console.error("API error response:", errorText)
            throw new Error(`API request failed with status ${response.status}: ${errorText}`)
        }

        // Parse the response
        const jsonResponse = await response.json()

        if (!jsonResponse.success) {
            throw new Error(jsonResponse.message || "API reported failure")
        }

        return {
            success: true,
            message: `Successfully uploaded chunk ${chunkNumber}/${totalChunks}`,
            chunkNumber,
            ...jsonResponse
        }
    } catch (error: any) {
        console.error(`Error uploading chunk ${chunkNumber}:`, error)
        throw new Error(`Failed to upload chunk ${chunkNumber}: ${error.message}`)
    }
}

/**
 * Finalize the chunked upload process
 * @param sessionId - Session ID for the chunked upload
 * @param totalChunks - Total number of chunks
 * @returns Promise resolving to final processing result
 */
const finalizeChunkedUpload = async (sessionId: string, totalChunks: number) => {
    try {
        console.log(`Finalizing chunked upload for session ${sessionId}`)

        // Use the API URL for finalizing chunked upload
        const apiUrl = getApiUrl("/finalize-chunked-upload")

        // Make the API request
        const response = await fetch(apiUrl, {
            method: "POST",
            body: JSON.stringify({
                sessionId,
                totalChunks
            }),
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json"
            }
        })

        // Check if the response is successful
        if (!response.ok) {
            const errorText = await response.text()
            console.error("API error response:", errorText)
            throw new Error(`API request failed with status ${response.status}: ${errorText}`)
        }

        // Parse the response
        const jsonResponse = await response.json()

        if (!jsonResponse.success) {
            throw new Error(jsonResponse.message || "API reported failure")
        }

        return {
            success: true,
            message: "Successfully finalized chunked upload",
            ...jsonResponse
        }
    } catch (error: any) {
        console.error("Error finalizing chunked upload:", error)
        throw new Error(`Failed to finalize chunked upload: ${error.message}`)
    }
}

/**
 * Process a single audio file
 * @param audioUri - URI of the audio file to process
 * @returns Promise resolving to processing result
 */
const processAudioFile = async (audioUri: string) => {
    try {
        console.log("Processing audio file:", audioUri)

        // Upload the audio file to the backend
        const result = await uploadAudioToBackend(audioUri)

        return {
            message: "Successfully processed audio file",
            ...result
        }
    } catch (error) {
        console.error("Error processing audio file:", error)
        throw error
    }
}

// Track recent request IDs for better deduplication
const recentRequestIds = new Map<string, { requestId: string; timestamp: number }>()
// Keep track of files currently being uploaded to prevent duplicates
const uploadingFiles = new Set<string>()

/**
 * Upload audio to the backend API for processing
 * @param audioUri - URI of the audio file to upload
 * @returns Promise resolving to processing result with transcription and recommendations
 */
export const uploadAudioToBackend = async (audioUri: string) => {
    try {
        console.log("Uploading audio to backend API:", audioUri)

        // Generate a unique key for this upload (using file path only - remove timestamp)
        const uploadKey = audioUri

        // Check if this exact file upload is already in progress
        if (uploadingFiles.has(uploadKey)) {
            console.log("Upload already in progress for this file, skipping duplicate upload")
            throw new Error("Upload already in progress for this file")
        }

        // Check if we recently uploaded this exact file (within 30 seconds)
        const recentUpload = recentRequestIds.get(uploadKey)
        if (recentUpload && Date.now() - recentUpload.timestamp < 30000) {
            console.log("This file was recently uploaded, reusing request ID")
            // We'll continue but use the same request ID to help server detect duplicate
        }

        // Generate a new request ID or reuse recent one
        const requestId = recentUpload?.requestId || uuidv4()

        // Store this request ID for potential retries
        recentRequestIds.set(uploadKey, {
            requestId: requestId,
            timestamp: Date.now()
        })

        // Automatically remove from recent requests after 30 seconds
        setTimeout(() => {
            // Only delete if it's still the same request ID (hasn't been updated)
            const current = recentRequestIds.get(uploadKey)
            if (current && current.requestId === requestId) {
                recentRequestIds.delete(uploadKey)
            }
        }, 30000)

        // Mark file as being uploaded
        uploadingFiles.add(uploadKey)

        // Prepare form data for file upload
        const formData = new FormData()

        // Get file name from URI
        const fileName = audioUri.split("/").pop() || "recording.m4a"
        console.log("File name:", fileName)

        // Create file object from URI
        const fileInfo = await FileSystem.getInfoAsync(audioUri)
        console.log("File info:", fileInfo)

        const fileUriParts = audioUri.split(".")
        const fileType = fileUriParts[fileUriParts.length - 1]
        console.log("File type:", fileType)

        // Add the audio file to form data
        console.log("Creating form data with audio file")
        formData.append("audio", {
            uri: audioUri,
            name: fileName,
            type: `audio/${fileType}`
        } as any)

        // Use the API URL for medical audio processing with emulator flag AND request ID parameters
        let apiUrl = getApiUrl("/process-medical-audio")
        // Add the request ID and client ID as query parameters (more reliable than headers)
        apiUrl = `${apiUrl}&clientId=${encodeURIComponent(CLIENT_ID)}&requestId=${encodeURIComponent(requestId)}`
        console.log("API URL with IDs:", apiUrl)

        // Log the request we're about to make with request ID
        console.log(`Making POST request with form data, request ID: ${requestId}`)

        // Make the API request with deduplication headers
        const response = await fetch(apiUrl, {
            method: "POST",
            body: formData,
            headers: {
                Accept: "application/json",
                "X-Request-ID": requestId,
                "X-Client-ID": CLIENT_ID
            }
        })

        console.log("Response status:", response.status)
        console.log("Response headers:", response.headers)

        // Check if the response is successful
        if (!response.ok) {
            const errorText = await response.text()
            console.error("API error response:", errorText)
            throw new Error(`API request failed with status ${response.status}: ${errorText}`)
        }

        // Parse the response
        const jsonResponse = await response.json()
        console.log("API response:", jsonResponse)

        // If server detected this as a duplicate request
        if (jsonResponse.isDuplicate) {
            console.log("Server detected duplicate request, reusing existing recording")
        }

        if (!jsonResponse.success) {
            throw new Error(jsonResponse.message || "API reported failure")
        }

        return {
            success: true,
            recordingId: jsonResponse.recordingId,
            transcript: jsonResponse.transcript,
            recommendations: jsonResponse.recommendations,
            file: jsonResponse.file,
            isDuplicate: jsonResponse.isDuplicate || false
        }
    } catch (error: any) {
        console.error("Error uploading audio to backend:", error)
        throw new Error(`Failed to upload audio: ${error.message}`)
    } finally {
        // Remove from set of uploading files
        uploadingFiles.delete(audioUri)
    }
}

/**
 * Fetch recording history from the API
 * @param cacheBuster - Optional cache busting query parameter
 * @returns Promise resolving to a list of recordings
 */
export const fetchRecordingHistory = async (cacheBuster?: string) => {
    try {
        console.log("Fetching recording history from API")

        // API endpoint for fetching recordings with emulator flag
        const apiUrl = getApiUrl("/recordings", cacheBuster)

        console.log("API URL:", apiUrl)

        // Make the API request
        const response = await fetch(apiUrl, {
            method: "GET",
            headers: {
                Accept: "application/json"
            }
        })

        // Check if the response is successful
        if (!response.ok) {
            const errorText = await response.text()
            throw new Error(`Failed to fetch recordings: ${errorText}`)
        }

        // Parse the response
        const jsonResponse = await response.json()

        if (!jsonResponse.success) {
            throw new Error(jsonResponse.message || "API reported failure")
        }

        return jsonResponse.recordings
    } catch (error: any) {
        console.error("Error fetching recording history:", error)
        throw new Error(`Failed to fetch recordings: ${error.message}`)
    }
}

/**
 * Fetch a single recording from the API
 * @param recordingId - ID of the recording to fetch
 * @returns Promise resolving to recording details
 */
export const fetchRecording = async (recordingId: string) => {
    try {
        console.log(`Fetching recording ${recordingId} from API`)

        // API endpoint for fetching a specific recording with emulator flag
        const apiUrl = getApiUrl(`/recordings/${recordingId}`)

        // Make the API request
        const response = await fetch(apiUrl, {
            method: "GET",
            headers: {
                Accept: "application/json"
            }
        })

        // Check if the response is successful
        if (!response.ok) {
            const errorText = await response.text()
            throw new Error(`Failed to fetch recording: ${errorText}`)
        }

        // Parse the response
        const jsonResponse = await response.json()

        if (!jsonResponse.success) {
            throw new Error(jsonResponse.message || "API reported failure")
        }

        return jsonResponse.recording
    } catch (error: any) {
        console.error(`Error fetching recording ${recordingId}:`, error)
        throw new Error(`Failed to fetch recording: ${error.message}`)
    }
}

/**
 * Delete a single recording
 * @param recordingId - ID of the recording to delete
 * @param cacheBuster - Optional cache busting parameter
 * @returns Promise resolving to success status
 */
export const deleteRecording = async (recordingId: string, cacheBuster?: string) => {
    try {
        console.log(`Deleting recording ${recordingId}`)

        // API endpoint for deleting a specific recording
        const apiUrl = getApiUrl(`/recordings/${recordingId}`, cacheBuster)

        // Make the API request
        const response = await fetch(apiUrl, {
            method: "DELETE",
            headers: {
                Accept: "application/json"
            }
        })

        // Check if the response is successful
        if (!response.ok) {
            const errorText = await response.text()
            throw new Error(`Failed to delete recording: ${errorText}`)
        }

        // Parse the response
        const jsonResponse = await response.json()

        if (!jsonResponse.success) {
            throw new Error(jsonResponse.message || "API reported failure")
        }

        return {
            success: true,
            message: jsonResponse.message || "Recording deleted successfully"
        }
    } catch (error: any) {
        console.error("Error deleting recording:", error)
        throw new Error(`Failed to delete recording: ${error.message}`)
    }
}

/**
 * Delete all recordings
 * @returns Promise resolving to success status
 */
export const deleteAllRecordings = async () => {
    try {
        console.log("Deleting all recordings")

        // API endpoint for deleting all recordings
        const apiUrl = getApiUrl("/recordings/all")

        // Make the API request
        const response = await fetch(apiUrl, {
            method: "DELETE",
            headers: {
                Accept: "application/json"
            }
        })

        // Check if the response is successful
        if (!response.ok) {
            const errorText = await response.text()
            throw new Error(`Failed to delete all recordings: ${errorText}`)
        }

        // Parse the response
        const jsonResponse = await response.json()

        if (!jsonResponse.success) {
            throw new Error(jsonResponse.message || "API reported failure")
        }

        return {
            success: true,
            message: jsonResponse.message || "All recordings deleted successfully",
            count: jsonResponse.count || 0
        }
    } catch (error: any) {
        console.error("Error deleting all recordings:", error)
        throw new Error(`Failed to delete all recordings: ${error.message}`)
    }
}

/**
 * Clear local audio files from app storage
 * @returns Promise resolving to success status
 */
export const clearLocalAudioFiles = async () => {
    try {
        console.log("Clearing local audio files")

        // Get the directory for audio recordings
        const audioDir = `${FileSystem.documentDirectory}recordings/`

        // Check if directory exists
        const dirInfo = await FileSystem.getInfoAsync(audioDir)

        if (dirInfo.exists) {
            // Read directory contents
            const files = await FileSystem.readDirectoryAsync(audioDir)
            console.log(`Found ${files.length} files to delete`)

            // Delete each file
            const deletePromises = files.map((file) =>
                FileSystem.deleteAsync(`${audioDir}${file}`, { idempotent: true })
            )

            await Promise.all(deletePromises)

            console.log("All local audio files cleared")
        } else {
            console.log("Audio directory does not exist, nothing to clear")
        }

        return {
            success: true,
            message: "Local audio files cleared successfully"
        }
    } catch (error: any) {
        console.error("Error clearing local audio files:", error)
        throw new Error(`Failed to clear local audio files: ${error.message}`)
    }
}

/**
 * Get list of local audio files but only return those that exist in Firebase
 * @returns Promise resolving to a list of local audio paths that have Firebase records
 */
export const getFirebaseSyncedAudioFiles = async (): Promise<string[]> => {
    try {
        // First fetch all recordings from Firebase
        const firebaseRecordings = await fetchRecordingHistory()

        // Extract timestamps from Firebase recordings
        const syncedTimestamps = new Set(
            firebaseRecordings.map((recording: any) => recording.timestamp || recording.id || "")
        )

        // Get local audio directory
        const audioDir = `${FileSystem.documentDirectory}functions/audio/`

        // Check if directory exists
        const dirInfo = await FileSystem.getInfoAsync(audioDir)
        if (!dirInfo.exists) {
            console.log("Audio directory does not exist")
            return []
        }

        // Get all local audio files
        const files = await FileSystem.readDirectoryAsync(audioDir)

        // Filter local files to only include those that exist in Firebase
        const syncedFiles = files.filter((file) => {
            // Extract timestamp from filename (assuming format is timestamp.m4a)
            const timestamp = file.split(".")[0]
            return syncedTimestamps.has(timestamp)
        })

        // Return full paths to the synced files
        return syncedFiles.map((file) => `${audioDir}${file}`)
    } catch (error) {
        console.error("Error getting Firebase synced audio files:", error)
        return []
    }
}
