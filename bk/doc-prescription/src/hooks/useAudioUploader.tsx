import axios from "axios";
import { useState } from "react";

export const useAudioUploader = () => {
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const uploadAudioToServer = async (audioBlob: Blob): Promise<any> => {
    const apiUrl = "http://localhost:8000/api/process-conversation"; // replace with your backend URL

    try {
      setIsUploading(true);
      setError(null);
      setUploadProgress(0);

      const formData = new FormData();
      formData.append("audio", audioBlob, "conversation.wav");

      const response = await axios.post(apiUrl, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
        timeout: 30000, // 30 seconds
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percent = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total
            );
            setUploadProgress(percent);
          }
        },
      });

      return response.data; // Return server response (e.g., transcription or success message)
    } catch (err: any) {
      console.error("Upload failed:", err);

      if (axios.isAxiosError(err)) {
        if (err.code === "ECONNABORTED") {
          setError("Upload timed out. Please try again.");
        } else if (err.response) {
          setError(`Server error: ${err.response.status} ${err.response.statusText}`);
        } else {
          setError("Network error. Please check your connection.");
        }
      } else {
        setError("Unexpected error occurred.");
      }

      throw err;
    } finally {
      setIsUploading(false);
    }
  };

  return {
    uploadAudioToServer,
    uploadProgress,
    isUploading,
    error,
  };
};
