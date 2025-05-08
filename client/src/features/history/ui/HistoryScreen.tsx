import { FontAwesome } from '@expo/vector-icons';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import {
	CompositeNavigationProp,
	useFocusEffect,
} from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as FileSystem from 'expo-file-system';
import React, { useCallback, useState } from 'react';
import {
	ActivityIndicator,
	Alert,
	FlatList,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { deleteAllRecordings, clearLocalAudioFiles, fetchRecordingHistory, deleteRecording } from '../../../shared/lib/audioProcessor';
import { TabParamList, RootStackParamList } from '../../../shared/types/navigation';

// Extend the global interface to allow for recordingsCache
declare global {
	var recordingsCache: Recording[] | null;
}

type HistoryScreenProps = {
	navigation: CompositeNavigationProp<
		BottomTabNavigationProp<TabParamList, 'History'>,
		NativeStackNavigationProp<RootStackParamList>
	>;
};

interface Recording {
	id: string;
	filename: string;
	path: string;
	storageUrl?: string; // Add this!
	transcript?: string;
	recommendations?: string;
	uploadedAt: {
		seconds: number;
		nanoseconds: number;
	};
}

const HistoryScreen: React.FC<HistoryScreenProps> = ({ navigation }) => {
	const [recordings, setRecordings] = useState<Recording[]>([]);
	const [loading, setLoading] = useState<boolean>(true);
	const [error, setError] = useState<string | null>(null);
	const [isDeleting, setIsDeleting] = useState<boolean>(false);

	// Function to refresh recordings after deletion
	const refreshRecordings = () => {
		setRecordings([]);
		loadRecordings();
	};

	// Function to handle deletion of all recordings
	const handleDeleteAllRecordings = () => {
		Alert.alert(
			'Delete All Recordings',
			'Are you sure you want to delete all recordings and consultations? This action cannot be undone.',
			[
				{ text: 'Cancel', style: 'cancel' },
				{
					text: 'Delete',
					style: 'destructive',
					onPress: async () => {
						try {
							setIsDeleting(true);

							// Force clear recordings to show immediate feedback
							setRecordings([]);

							// Make sure cache is cleared
							global.recordingsCache = null;

							// Attempt to delete all recordings from the server
							try {
								console.log('Deleting all recordings from server...');
								const serverResult = await deleteAllRecordings();
								console.log('Server delete result:', serverResult);

								// If successful, clear local files
								await clearLocalAudioFiles();

								// Short delay to allow server processing
								await new Promise((resolve) => setTimeout(resolve, 500));

								// Verify deletion was successful
								const timestamp = new Date().getTime();
								const verifyRecordings = await fetchRecordingHistory(
									`nocache=${timestamp}`
								);

								if (verifyRecordings && verifyRecordings.length > 0) {
									console.warn(
										`${verifyRecordings.length} recordings remain after bulk deletion, attempting individual deletion`
									);

									// Fall back to individual deletion
									const deletePromises = verifyRecordings.map(
										(recording: Recording) =>
											deleteRecording(recording.id, `force=${timestamp}`).catch(
												(err: Error) =>
													console.warn(
														`Failed to delete recording ${recording.id}:`,
														err
													)
											)
									);
									await Promise.all(deletePromises);
								} else {
									console.log('All recordings successfully deleted');
								}
							} catch (serverError) {
								console.warn(
									'Server deletion failed, falling back to individual deletion:',
									serverError
								);

								// Fall back to individual deletion if bulk deletion fails
								try {
									// Use cache buster to ensure we get fresh data
									const timestamp = new Date().getTime();
									const allRecordings = await fetchRecordingHistory(
										`nocache=${timestamp}`
									);

									if (allRecordings && allRecordings.length > 0) {
										console.log(
											`Found ${allRecordings.length} recordings that need individual deletion`
										);
										const deletePromises = allRecordings.map(
											(recording: Recording) =>
												deleteRecording(
													recording.id,
													`force=${timestamp}`
												).catch((err: Error) =>
													console.warn(
														`Failed to delete recording ${recording.id}:`,
														err
													)
												)
										);
										await Promise.all(deletePromises);
									}
								} catch (fallbackError) {
									console.warn(
										'Fallback individual deletion failed:',
										fallbackError
									);
								}
							}

							// Clear local audio files regardless of server status
							try {
								await clearLocalAudioFiles();
							} catch (localError) {
								console.warn('Failed to clear local files:', localError);
							}

							Alert.alert(
								'Success',
								'All recordings have been deleted successfully.',
								[{ text: 'OK' }]
							);

							// Wait a moment before trying to refresh to allow server to process deletions
							setTimeout(() => {
								loadRecordings();
							}, 1500); // Increased timeout to give server more time
						} catch (error: any) {
							Alert.alert(
								'Error',
								`Failed to delete all recordings: ${error.message}`,
								[{ text: 'OK' }]
							);
							loadRecordings(); // Reload the current state
						} finally {
							setIsDeleting(false);
						}
					},
				},
			]
		);
	};

	// Load recordings when the screen comes into focus
	useFocusEffect(
		useCallback(() => {
			loadRecordings();
			return () => {}; // Cleanup function if needed
		}, [])
	);

	const loadRecordings = async () => {
		try {
			setLoading(true);
			setError(null);

			// Add cache-busting query parameter
			const timestamp = new Date().getTime();
			console.log(`Fetching recordings with cache buster: ${timestamp}`);

			// Clear any in-memory cache first
			global.recordingsCache = null;

			// Force a delay before fetching to ensure server has time to process any deletions
			await new Promise((resolve) => setTimeout(resolve, 300));

			// Fetch recordings from the API with cache buster
			const recordingsData = await fetchRecordingHistory(
				`nocache=${timestamp}`
			);
			console.log('Fetched recordings:', recordingsData);

			// Verify we got fresh data
			if (recordingsData) {
				console.log(`Fetched ${recordingsData.length} recordings`);
			}

			setRecordings(recordingsData || []);
		} catch (error: any) {
			console.error('Error loading recordings:', error);
			setError(error.message || 'Failed to load recordings');
			// Don't show alert on load errors - just show empty state
			setRecordings([]);
		} finally {
			setLoading(false);
		}
	};

	const formatDate = (timestamp: { seconds: number; nanoseconds: number }) => {
		if (!timestamp) return 'Unknown date';

		const date = new Date(timestamp.seconds * 1000);
		return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
	};

	const handleRecordingPress = (recording: Recording) => {
		// Navigate to the recording details screen with complete file information
		navigation.navigate('Report', {
			recordingId: recording.id,
			audioUri: null, // We'll use storageUrl instead of local path
			transcription: recording.transcript,
			recommendations: recording.recommendations,
			file: {
				storageUrl: recording.storageUrl, // Add this!
				filename: recording.filename,
				path: recording.path,
			},
			skipCopyingAudio: true, // Skip trying to copy the audio file locally
		});
	};

	const renderEmptyList = () => (
		<View style={styles.emptyContainer}>
			{loading ? (
				<ActivityIndicator size='large' color='#007AFF' />
			) : error ? (
				<>
					<FontAwesome name='exclamation-circle' size={50} color='#FF3B30' />
					<Text style={styles.emptyText}>Error loading recordings</Text>
					<Text style={styles.errorText}>{error}</Text>
					<TouchableOpacity style={styles.retryButton} onPress={loadRecordings}>
						<Text style={styles.retryButtonText}>Retry</Text>
					</TouchableOpacity>
				</>
			) : (
				<>
					<FontAwesome name='microphone' size={50} color='#8E8E93' />
					<Text style={styles.emptyText}>No recordings yet</Text>
					<Text style={styles.emptySubtext}>
						Your recordings will appear here
					</Text>
					<TouchableOpacity
						style={styles.recordButton}
						onPress={() => navigation.navigate('Recording')}
					>
						<Text style={styles.recordButtonText}>Start Recording</Text>
					</TouchableOpacity>
				</>
			)}
		</View>
	);

	const renderItem = ({ item }: { item: Recording }) => {
		// Build the full path to the audio file
		const fullAudioPath = `${
			FileSystem.documentDirectory
		}functions/audio/${item.path.split('/').pop()}`;

		return (
			<TouchableOpacity
				style={styles.recordingItem}
				onPress={() =>
					navigation.navigate('Report', {
						recordingId: item.id,
						audioUri: null, // Use storageUrl instead
						transcription: item.transcript,
						recommendations: item.recommendations,
						file: {
							storageUrl: item.storageUrl, // Add this!
							filename: item.filename,
							path: item.path,
						},
						skipCopyingAudio: true,
					})
				}
			>
				<View style={styles.recordingInfo}>
					<Text style={styles.recordingTitle} numberOfLines={1}>
						{item.filename.split('-').pop()?.split('.')[0] || 'Recording'}
					</Text>
					<Text style={styles.recordingDate}>
						{formatDate(item.uploadedAt)}
					</Text>
					{item.transcript && (
						<Text style={styles.transcriptPreview} numberOfLines={2}>
							{item.transcript.substring(0, 100)}
							{item.transcript.length > 100 ? '...' : ''}
						</Text>
					)}
				</View>
				<FontAwesome name='chevron-right' size={16} color='#C7C7CC' />
			</TouchableOpacity>
		);
	};

	return (
		<SafeAreaView style={styles.container} edges={['top']}>
			<View style={styles.contentContainer}>
				<View style={styles.headerContainer}>
					<Text style={styles.headerTitle}>Consultation History</Text>
					{recordings.length > 0 && (
						<TouchableOpacity
							style={styles.clearButton}
							onPress={handleDeleteAllRecordings}
							disabled={isDeleting}
						>
							{isDeleting ? (
								<ActivityIndicator size='small' color='#FF3B30' />
							) : (
								<Text style={styles.clearButtonText}>Delete All</Text>
							)}
						</TouchableOpacity>
					)}
				</View>

				{recordings.length > 0 ? (
					<>
						<FlatList
							data={recordings}
							renderItem={renderItem}
							keyExtractor={(item) => item.id}
							contentContainerStyle={styles.listContainer}
						/>
						<TouchableOpacity
							style={styles.newConsultationButton}
							onPress={() => navigation.navigate('Recording')}
						>
							<FontAwesome
								name='plus'
								size={16}
								color='#fff'
								style={styles.buttonIcon}
							/>
							<Text style={styles.newConsultationButtonText}>
								New Consultation
							</Text>
						</TouchableOpacity>
					</>
				) : (
					renderEmptyList()
				)}
			</View>
		</SafeAreaView>
	);
};

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: '#f5f5f7',
	},
	contentContainer: {
		flex: 1,
		padding: 16,
	},
	headerTitle: {
		fontSize: 22,
		fontWeight: 'bold',
		marginBottom: 16,
		marginTop: 10,
		color: '#333',
	},
	listContainer: {
		paddingBottom: 80, // Add space for the button at the bottom
	},
	recordingItem: {
		flexDirection: 'row',
		alignItems: 'center',
		backgroundColor: 'white',
		borderRadius: 12,
		padding: 16,
		marginBottom: 12,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.1,
		shadowRadius: 2,
		elevation: 2,
	},
	recordingInfo: {
		flex: 1,
	},
	recordingTitle: {
		fontSize: 16,
		fontWeight: '600',
		color: '#1C1C1E',
		marginBottom: 4,
	},
	recordingDate: {
		fontSize: 14,
		color: '#8E8E93',
		marginBottom: 8,
	},
	transcriptPreview: {
		fontSize: 14,
		color: '#3A3A3C',
		lineHeight: 20,
	},
	emptyContainer: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		padding: 32,
	},
	emptyText: {
		fontSize: 20,
		fontWeight: '600',
		color: '#1C1C1E',
		marginTop: 16,
		marginBottom: 8,
		textAlign: 'center',
	},
	emptySubtext: {
		fontSize: 16,
		color: '#8E8E93',
		textAlign: 'center',
		marginBottom: 24,
	},
	recordButton: {
		backgroundColor: '#007AFF',
		borderRadius: 12,
		paddingVertical: 12,
		paddingHorizontal: 24,
		marginTop: 16,
	},
	recordButtonText: {
		color: 'white',
		fontSize: 16,
		fontWeight: '600',
	},
	errorText: {
		color: '#FF3B30',
		marginVertical: 8,
		textAlign: 'center',
	},
	retryButton: {
		backgroundColor: '#007AFF',
		borderRadius: 12,
		paddingVertical: 12,
		paddingHorizontal: 24,
		marginTop: 16,
	},
	retryButtonText: {
		color: 'white',
		fontSize: 16,
		fontWeight: '600',
	},
	newConsultationButton: {
		position: 'absolute',
		bottom: 20,
		left: 16,
		right: 16,
		backgroundColor: '#007AFF',
		paddingVertical: 15,
		borderRadius: 30,
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		shadowColor: '#007AFF',
		shadowOffset: {
			width: 0,
			height: 4,
		},
		shadowOpacity: 0.3,
		shadowRadius: 6,
		elevation: 8,
	},
	buttonIcon: {
		marginRight: 10,
	},
	newConsultationButtonText: {
		color: 'white',
		fontSize: 16,
		fontWeight: '600',
	},
	headerContainer: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		marginBottom: 16,
	},
	clearButton: {
		paddingVertical: 6,
		paddingHorizontal: 12,
	},
	clearButtonText: {
		fontSize: 14,
		color: '#FF3B30',
		fontWeight: '500',
	},
});

export default HistoryScreen;
