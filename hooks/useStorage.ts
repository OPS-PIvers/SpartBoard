import { useState } from 'react';
import {
  ref,
  uploadBytes,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import { doc, setDoc } from 'firebase/firestore';
import { storage, db, auth } from '@/config/firebase';
import { useGoogleDrive } from './useGoogleDrive';
import type { GuidedLearningSet, PdfItem } from '@/types';
import { makeSlideThumbnail } from '@/utils/guidedLearningMedia';
import {
  releaseDriveFiles,
  releaseStorageFiles,
} from '@/utils/guidedLearningFileRelease';

export const MAX_PDF_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

/** Personal sets keep slides on the teacher's Drive; district sets on Firebase Storage. */
export type GuidedLearningMediaHome = 'drive' | 'storage';

export interface GuidedLearningImageUpload {
  url: string;
  storagePath: string;
  driveFileId?: string;
  thumbnailUrl?: string;
}

export const useStorage = () => {
  const [uploading, setUploading] = useState(false);
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

  // Board-level uploads: Drive when connected (for all users including admins),
  // falling back to Firebase Storage when Drive is not connected.

  const uploadBackgroundImage = async (
    userId: string,
    file: File
  ): Promise<string> => {
    if (driveService) {
      setUploading(true);
      try {
        const driveFile = await driveService.uploadFile(
          file,
          `background-${Date.now()}-${file.name}`,
          'Assets/Backgrounds'
        );
        await driveService.makePublic(driveFile.id, userDomain);
        return `https://lh3.googleusercontent.com/d/${driveFile.id}`;
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
    if (driveService) {
      setUploading(true);
      try {
        const driveFile = await driveService.uploadFile(
          file,
          `sticker-${Date.now()}-${file.name}`,
          'Assets/Stickers'
        );
        await driveService.makePublic(driveFile.id, userDomain);
        return `https://lh3.googleusercontent.com/d/${driveFile.id}`;
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
    if (driveService) {
      setUploading(true);
      try {
        const driveFile = await driveService.uploadFile(
          file,
          `display-${Date.now()}-${file.name}`,
          'Assets/DisplayImages'
        );
        await driveService.makePublic(driveFile.id, userDomain);
        return `https://lh3.googleusercontent.com/d/${driveFile.id}`;
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

  /**
   * Resumable Firebase Storage upload with percent progress (0–100).
   * Used for large guided-learning media (MP4 slides, screen recordings)
   * where the binary `uploading` spinner isn't enough feedback.
   */
  const uploadFileWithProgress = async (
    path: string,
    blob: Blob,
    onProgress?: (percent: number) => void
  ): Promise<string> => {
    setUploading(true);
    try {
      const storageRef = ref(storage, path);
      // Timestamped paths cache as immutable; the marker lets the weekly GL sweep consider the file.
      const task = uploadBytesResumable(storageRef, blob, {
        cacheControl: 'public, max-age=31536000, immutable',
        customMetadata: { glMedia: '1' },
      });
      await new Promise<void>((resolve, reject) => {
        task.on(
          'state_changed',
          (snapshot) => {
            if (snapshot.totalBytes > 0) {
              onProgress?.(
                Math.round(
                  (snapshot.bytesTransferred / snapshot.totalBytes) * 100
                )
              );
            }
          },
          reject,
          resolve
        );
      });
      return await getDownloadURL(task.snapshot.ref);
    } finally {
      setUploading(false);
    }
  };

  /**
   * Upload guided-learning AV media (video slides, screen recordings, and
   * per-step audio/video files). Always writes to Firebase Storage (never
   * Drive): `lh3.googleusercontent.com` Drive links only serve images, so a
   * Drive-hosted MP4/MP3 can't stream in a `<video>`/`<audio>` tag.
   * Reuses the `hotspot_images` path so existing storage rules cover it.
   */
  const uploadGuidedLearningMedia = async (
    userId: string,
    blob: Blob,
    fileName: string,
    onProgress?: (percent: number) => void
  ): Promise<{ url: string; storagePath: string }> => {
    const storagePath = `users/${userId}/hotspot_images/${Date.now()}-${fileName}`;
    const url = await uploadFileWithProgress(storagePath, blob, onProgress);
    return { url, storagePath };
  };

  // Image slides: Drive for personal sets (Storage when Drive is off), Storage with a thumbnail for district sets.
  const uploadGuidedLearningImage = async (
    userId: string,
    blob: Blob,
    fileName: string,
    home: GuidedLearningMediaHome = 'drive'
  ): Promise<GuidedLearningImageUpload> => {
    if (home === 'drive' && driveService) {
      setUploading(true);
      try {
        const driveFile = await driveService.uploadFile(
          blob,
          `hotspot-${Date.now()}-${fileName}`,
          'Assets/HotspotImages'
        );
        await driveService.makePublic(driveFile.id, undefined);
        return {
          url: `https://lh3.googleusercontent.com/d/${driveFile.id}`,
          storagePath: '',
          driveFileId: driveFile.id,
        };
      } finally {
        setUploading(false);
      }
    }
    const uploaded = await uploadGuidedLearningMedia(userId, blob, fileName);
    const file =
      blob instanceof File
        ? blob
        : new File([blob], fileName, { type: blob.type });
    const thumb = await makeSlideThumbnail(file).catch(() => null);
    if (!thumb) return uploaded;
    const thumbnailPath = uploaded.storagePath.replace(
      /\/([^/]+?)(\.[^./]+)?$/,
      '/thumbs/$1.webp'
    );
    try {
      const thumbnailUrl = await uploadFileWithProgress(thumbnailPath, thumb);
      return { ...uploaded, thumbnailUrl };
    } catch {
      // The slide itself landed; the library just shows the full image.
      return uploaded;
    }
  };

  const deleteDriveFile = async (fileId: string): Promise<void> => {
    if (!driveService) return;
    await driveService.deleteFile(fileId);
  };

  // Files a GL editor removed: Storage through the server's reference check, Drive after the teacher's own.
  const releaseGuidedLearningFiles = async (
    setId: string,
    building: boolean,
    files: { storagePaths: string[]; driveFileIds: string[] }
  ): Promise<void> => {
    const uid = auth.currentUser?.uid;
    await Promise.all([
      releaseStorageFiles(setId, building, files.storagePaths),
      uid && driveService && files.driveFileIds.length > 0
        ? releaseDriveFiles(
            {
              uid,
              candidates: files.driveFileIds,
              excludeSetId: setId,
              loadSet: async (id) =>
                JSON.parse(
                  await (await driveService.downloadFile(id)).text()
                ) as GuidedLearningSet,
            },
            (id) => driveService.deleteFile(id)
          )
        : null,
    ]);
  };

  const uploadHotspotImage = async (
    userId: string,
    file: File
  ): Promise<string> => {
    if (driveService) {
      setUploading(true);
      try {
        const driveFile = await driveService.uploadFile(
          file,
          `hotspot-${Date.now()}-${file.name}`,
          'Assets/HotspotImages'
        );
        // Pass undefined to force type:'anyone' sharing so the image URL is
        // publicly renderable in all contexts (matches uploadBackgroundToDrive).
        await driveService.makePublic(driveFile.id, undefined);
        return `https://lh3.googleusercontent.com/d/${driveFile.id}`;
      } finally {
        setUploading(false);
      }
    }

    const timestamp = Date.now();
    return uploadFile(
      `users/${userId}/hotspot_images/${timestamp}-${file.name}`,
      file
    );
  };

  const uploadScreenshot = async (
    userId: string,
    blob: Blob
  ): Promise<string> => {
    if (driveService) {
      setUploading(true);
      try {
        const driveFile = await driveService.uploadFile(
          blob,
          `screenshot-${Date.now()}.jpg`,
          'Assets/Screenshots'
        );
        await driveService.makePublic(driveFile.id, userDomain);
        return `https://lh3.googleusercontent.com/d/${driveFile.id}`;
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
    // Blob URLs are session-only — revoke and return
    if (filePath.startsWith('blob:')) {
      URL.revokeObjectURL(filePath);
      return;
    }

    // Drive-hosted URLs: move to Drive trash (recoverable) rather than permanently deleting
    // Parse the URL to check hostname exactly, preventing substring-spoofing attacks.
    let filePathHostname = '';
    let filePathPathname = '';
    try {
      ({ hostname: filePathHostname, pathname: filePathPathname } = new URL(
        filePath
      ));
    } catch {
      // filePath is not a valid URL; leave hostname empty so checks below fail safely
    }
    if (
      filePathHostname === 'lh3.googleusercontent.com' ||
      filePathHostname === 'drive.google.com' ||
      filePathHostname.endsWith('.drive.google.com')
    ) {
      if (driveService) {
        try {
          const match =
            /\/file\/d\/([^/?#]+)/.exec(filePath) ??
            /[?&]id=([^&#]+)/.exec(filePath) ??
            (filePathHostname === 'lh3.googleusercontent.com'
              ? /^\/d\/([^/?#=]+)/.exec(filePathPathname)
              : null);
          if (match) {
            await driveService.trashFile(match[1]);
          }
        } catch (e) {
          console.error('Failed to trash Drive file:', e);
        }
      }
      return;
    }

    const fileRef = ref(storage, filePath);
    await deleteObject(fileRef);
  };

  // Admin-menu uploads: always write to Firebase Storage so global assets
  // (backgrounds, weather images, stickers set by admins) are universally accessible.

  const uploadAdminBackground = async (
    backgroundId: string,
    file: File
  ): Promise<string> => {
    return uploadFile(`admin_backgrounds/${backgroundId}/${file.name}`, file);
  };

  const uploadWeatherImage = async (
    rangeId: string,
    file: File
  ): Promise<string> => {
    const timestamp = Date.now();
    const storageRef = ref(
      storage,
      `admin_weather/${rangeId}/${timestamp}-${file.name}`
    );

    const snapshot = await uploadBytes(storageRef, file);
    return getDownloadURL(snapshot.ref);
  };

  const uploadAdminSticker = async (file: File): Promise<string> => {
    const timestamp = Date.now();
    return uploadFile(`admin_stickers/${timestamp}-${file.name}`, file);
  };

  const uploadAdminWorkSymbol = async (file: File): Promise<string> => {
    const timestamp = Date.now();
    return uploadFile(`admin_work_symbols/${timestamp}-${file.name}`, file);
  };

  const uploadAdminLogo = async (file: File): Promise<string> => {
    return uploadFile(`admin_logos/custom_logo`, file);
  };

  const deleteAdminLogo = async (): Promise<void> => {
    const logoRef = ref(storage, 'admin_logos/custom_logo');
    try {
      await deleteObject(logoRef);
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code !== 'storage/object-not-found'
      ) {
        console.error('Error deleting admin logo:', error);
        throw error;
      }
    }
  };

  const uploadCatalystImage = async (
    routineId: string,
    file: File
  ): Promise<string> => {
    const timestamp = Date.now();
    return uploadFile(
      `catalyst/images/${routineId}/${timestamp}-${file.name}`,
      file
    );
  };

  const uploadPdf = async (
    userId: string,
    file: File
  ): Promise<{ url: string; storagePath: string }> => {
    if (driveService) {
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

  const uploadAdminPdf = async (
    file: File
  ): Promise<{ url: string; storagePath: string }> => {
    if (driveService) {
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
    const storagePath = `global_pdfs/${timestamp}-${file.name}`;
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
    uploadFileWithProgress,
    uploadGuidedLearningMedia,
    uploadGuidedLearningImage,
    deleteDriveFile,
    releaseGuidedLearningFiles,
    uploadBackgroundImage,
    uploadSticker,
    uploadDisplayImage,
    uploadHotspotImage,
    uploadScreenshot,
    deleteFile,
    uploadAdminBackground,
    uploadWeatherImage,
    uploadAdminSticker,
    uploadAdminWorkSymbol,
    uploadAdminLogo,
    deleteAdminLogo,
    uploadCatalystImage,
    uploadPdf,
    uploadAdminPdf,
    uploadAndRegisterPdf,
  };
};
