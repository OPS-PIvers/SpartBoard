import { useState } from 'react';
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import { doc, setDoc } from 'firebase/firestore';
import { storage, db } from '../config/firebase';
import { useAuth } from '../context/useAuth';
import { useGoogleDrive } from './useGoogleDrive';
import { PdfItem } from '../types';

export const MAX_PDF_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

export const useStorage = () => {
  const [uploading, setUploading] = useState(false);
  const { isAdmin } = useAuth();
  const { driveService, userDomain } = useGoogleDrive();

  const uploadFile = async (path: string, file: File): Promise<string> => {
    setUploading(true);
    try {
      const storageRef = ref(storage, path);
      const snapshot = await uploadBytes(storageRef, file);
      const url = await getDownloadURL(snapshot.ref);
      return url;
    } finally {
      setUploading(false);
    }
  };

  const uploadBackgroundImage = async (
    userId: string,
    file: File
  ): Promise<string> => {
    if (!isAdmin && driveService) {
      setUploading(true);
      try {
        const driveFile = await driveService.uploadFile(
          file,
          `background-${Date.now()}-${file.name}`,
          'Assets/Backgrounds'
        );
        // Make it public so it can be viewed as a background
        await driveService.makePublic(driveFile.id, userDomain);
        // Use webContentLink for direct image access
        return driveFile.webContentLink ?? driveFile.webViewLink ?? '';
      } finally {
        setUploading(false);
      }
    }

    const timestamp = Date.now();
    return uploadFile(
      `users/${userId}/backgrounds/${timestamp}-${file.name}`,
      file
    );
  };

  const uploadSticker = async (userId: string, file: File): Promise<string> => {
    if (!isAdmin && driveService) {
      setUploading(true);
      try {
        const driveFile = await driveService.uploadFile(
          file,
          `sticker-${Date.now()}-${file.name}`,
          'Assets/Stickers'
        );
        await driveService.makePublic(driveFile.id, userDomain);
        return driveFile.webContentLink ?? driveFile.webViewLink ?? '';
      } finally {
        setUploading(false);
      }
    }

    const timestamp = Date.now();
    return uploadFile(
      `users/${userId}/stickers/${timestamp}-${file.name}`,
      file
    );
  };

  const uploadDisplayImage = async (
    userId: string,
    file: File
  ): Promise<string> => {
    if (!isAdmin && driveService) {
      setUploading(true);
      try {
        const driveFile = await driveService.uploadFile(
          file,
          `display-${Date.now()}-${file.name}`,
          'Assets/DisplayImages'
        );
        await driveService.makePublic(driveFile.id, userDomain);
        return driveFile.webContentLink ?? driveFile.webViewLink ?? '';
      } finally {
        setUploading(false);
      }
    }

    const timestamp = Date.now();
    return uploadFile(
      `users/${userId}/display_images/${timestamp}-${file.name}`,
      file
    );
  };

  const uploadScreenshot = async (
    userId: string,
    blob: Blob
  ): Promise<string> => {
    if (!isAdmin && driveService) {
      setUploading(true);
      try {
        const driveFile = await driveService.uploadFile(
          blob,
          `screenshot-${Date.now()}.jpg`,
          'Assets/Screenshots'
        );
        await driveService.makePublic(driveFile.id, userDomain);
        return driveFile.webContentLink ?? driveFile.webViewLink ?? '';
      } finally {
        setUploading(false);
      }
    }

    const timestamp = Date.now();
    const storageRef = ref(
      storage,
      `users/${userId}/screenshots/${timestamp}.jpg`
    );

    setUploading(true);
    try {
      const snapshot = await uploadBytes(storageRef, blob);
      return await getDownloadURL(snapshot.ref);
    } finally {
      setUploading(false);
    }
  };

  const deleteFile = async (filePath: string): Promise<void> => {
    // If it's a Drive link, extract the file ID and delete via Drive API
    if (
      filePath.startsWith('https://lh3.googleusercontent.com') ||
      filePath.includes('drive.google.com')
    ) {
      if (!isAdmin && driveService) {
        try {
          const match = /\/file\/d\/([^/?#]+)/.exec(filePath);
          if (match) {
            await driveService.deleteFile(match[1]);
          }
        } catch (e) {
          console.error('Failed to delete from Drive:', e);
        }
      }
      return;
    }

    const fileRef = ref(storage, filePath);
    await deleteObject(fileRef);
  };

  const uploadAdminBackground = async (
    backgroundId: string,
    file: File
  ): Promise<string> => {
    // Admins always save to Firebase Storage for global availability
    return uploadFile(`admin_backgrounds/${backgroundId}/${file.name}`, file);
  };

  const uploadWeatherImage = async (
    rangeId: string,
    file: File
  ): Promise<string> => {
    // Admins always save to Firebase Storage for global availability
    const timestamp = Date.now();
    const storageRef = ref(
      storage,
      `admin_weather/${rangeId}/${timestamp}-${file.name}`
    );

    const snapshot = await uploadBytes(storageRef, file);
    return getDownloadURL(snapshot.ref);
  };

  const uploadAdminSticker = async (file: File): Promise<string> => {
    // Admins always save to Firebase Storage for global availability
    const timestamp = Date.now();
    return uploadFile(`admin_stickers/${timestamp}-${file.name}`, file);
  };

  const uploadPdf = async (
    userId: string,
    file: File
  ): Promise<{ url: string; storagePath: string }> => {
    if (!isAdmin && driveService) {
      setUploading(true);
      try {
        const driveFile = await driveService.uploadFile(
          file,
          `pdf-${Date.now()}-${file.name}`,
          'Assets/PDFs'
        );
        await driveService.makePublic(driveFile.id, userDomain);
        const previewUrl = `https://drive.google.com/file/d/${driveFile.id}/preview`;
        return {
          url: previewUrl,
          storagePath: driveFile.webViewLink ?? previewUrl,
        };
      } finally {
        setUploading(false);
      }
    }

    const timestamp = Date.now();
    const storagePath = `users/${userId}/pdfs/${timestamp}-${file.name}`;
    const url = await uploadFile(storagePath, file);
    return { url, storagePath };
  };

  const uploadAndRegisterPdf = async (
    userId: string,
    file: File
  ): Promise<PdfItem> => {
    const { url, storagePath } = await uploadPdf(userId, file);
    const pdfId = crypto.randomUUID() as string;
    const pdfData: PdfItem = {
      id: pdfId,
      name: file.name.replace(/\.pdf$/i, ''),
      storageUrl: url,
      storagePath,
      size: file.size,
      uploadedAt: Date.now(),
      order: 0,
    };
    await setDoc(doc(db, 'users', userId, 'pdfs', pdfId), pdfData);
    return pdfData;
  };

  return {
    uploading,
    uploadFile,
    uploadBackgroundImage,
    uploadSticker,
    uploadDisplayImage,
    uploadScreenshot,
    deleteFile,
    uploadAdminBackground,
    uploadWeatherImage,
    uploadAdminSticker,
    uploadPdf,
    uploadAndRegisterPdf,
  };
};
