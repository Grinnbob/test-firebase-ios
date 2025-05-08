// Define navigation types
export type RootStackParamList = {
	Main: undefined;
	Recording: undefined;
	Report: {
		audioUri?: string; // Make it optional
		recordingId?: string;
		transcription?: string;
		recommendations?: string;
		file?: {
			storageUrl?: string;
			filename?: string;
			path?: string;
		};
		recordingDuration?: number;
		isProcessing?: boolean;
		keepLocalFiles?: boolean;
		recordingTimestamp?: number;
		skipCopyingAudio?: boolean;
	};
	History: undefined;
	Settings: undefined;
};

// Define tab types
export type TabParamList = {
	History: undefined;
	Record: undefined;
	Settings: undefined;
};