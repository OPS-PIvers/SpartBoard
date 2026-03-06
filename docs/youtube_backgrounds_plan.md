Feature Implementation: Ambient YouTube Backgrounds & "My Uploads" GalleryOverviewPlease implement a new background system for the application that supports ambient, looping YouTube videos and a gallery of the user's past background uploads stored directly in their Google Drive.The feature consists of four main parts:Google Drive Integration: Update useGoogleDrive.ts to include functions for uploading backgrounds to a dedicated Drive folder (e.g., SPART BOARD > “Backgrounds") and fetching a list of previous uploads.Dashboard Video Layer: Update DashboardView.tsx to detect if the active dashboard background is a YouTube URL. If so, render an auto-playing, muted, looping <iframe> behind the widgets instead of applying a CSS background image.Admin Curation: Update BackgroundManager.tsx to allow admins to input a YouTube URL and Label. The system will auto-generate a YouTube thumbnail and save it to the background_presets collection in Firestore.Sidebar UX Overhaul: Refactor SidebarBackgrounds.tsx into three tabs:Media: Displays Admin-curated "Images" and "Ambient Videos" (auto-sorted from the presets array).Colors: Displays Solid Colors and Gradients.My Uploads: Contains the file upload button and a gallery of the user's previously uploaded backgrounds fetched from Google Drive.Please apply the following code changes to the specified files.Step 1: Update Google Drive HookFile: hooks/useGoogleDrive.tsAdd methods to handle background images specifically, mimicking how custom stickers or other media are handled. Ensure it checks for/creates a specific folder (e.g., "SPART_Backgrounds").// Add these functions to your useGoogleDrive hook (or similar service)
// Use the exact folder creation/fetching logic standard to your app's Drive integration.

const uploadBackgroundToDrive = async (file: File): Promise<string> => {
// 1. Find or create the "SPART_Backgrounds" folder
// 2. Upload the file using the multipart/related Google Drive API upload
// 3. Set the file permissions to 'anyone with the link can view' (if required for rendering)
// 4. Return the usable webContentLink or direct image rendering URL
};

const getUserBackgroundsFromDrive = async (): Promise<string[]> => {
// 1. Find the "SPART_Backgrounds" folder
// 2. Query for all image files inside this folder
// 3. Map the results to their respective usable image URLs
// 4. Return the array of URLs (newest first)
};

// Make sure to export them
return {
// ... existing exports
uploadBackgroundToDrive,
getUserBackgroundsFromDrive,
};
Step 2: Implement Ambient Video LayerFile: components/layout/DashboardView.tsxUpdate the renderer to support full-bleed YouTube iframes behind the widgets.// 1. Add this helper function outside the component definition
const extractYouTubeId = (url: string) => {
if (!url) return null;
const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?]+)/);
return match ? match[1] : null;
};

// 2. Inside DashboardView, add the detection logic
const isYouTube = activeDashboard && extractYouTubeId(activeDashboard.background);

// 3. Modify backgroundStyles to skip CSS backgrounds if it's a video
const backgroundStyles = useMemo(() => {
if (!activeDashboard || isYouTube) return {};
const bg = activeDashboard.background;

if (bg.startsWith('http') || bg.startsWith('data:')) {
return {
backgroundImage: `url("${bg}")`,
backgroundSize: 'cover',
backgroundPosition: 'center',
backgroundRepeat: 'no-repeat',
};
}
return {};
}, [activeDashboard, isYouTube]);

// 4. Update the main JSX return to include the video layer
return (

  <div
    id="dashboard-root"
    className={`relative h-screen w-screen overflow-hidden transition-all duration-1000 ${backgroundClasses} ${fontClass}`}
    style={backgroundStyles}
    onClick={(e) => e.stopPropagation()}
    onDragOver={handleDragOver}
    onDrop={handleDrop}
    onTouchStart={handleTouchStart}
    onTouchMove={handleTouchMove}
    onTouchEnd={handleTouchEnd}
  >
    {/* NEW: Ambient YouTube Video Layer */}
    {isYouTube && (
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none bg-black">
        <iframe
          src={`https://www.youtube.com/embed/${extractYouTubeId(activeDashboard.background)}?autoplay=1&mute=1&controls=0&loop=1&playlist=${extractYouTubeId(activeDashboard.background)}`}
          className="absolute top-1/2 left-1/2 w-[100vw] h-[56.25vw] min-h-[100vh] min-w-[177.77vh] -translate-x-1/2 -translate-y-1/2 pointer-events-none opacity-80"
          frameBorder="0"
          allow="autoplay; encrypted-media"
        />
      </div>
    )}

    {/* Existing Background Overlay for Depth */}
    <div className="absolute inset-0 bg-black/10 pointer-events-none z-0" />

    {/* Dynamic Widget Surface */}
    <div
      key={activeDashboard.id}
      className={`relative z-10 w-full h-full ${animationClass} transition-all duration-500 ease-in-out`}
      // ... keep existing inline styles and children

Step 3: Admin UI for Video CurationFile: components/admin/BackgroundManager.tsxAllow admins to add YouTube links to the background_presets collection in Firestore.// 1. Add the helper function at the top
const extractYouTubeId = (url: string) => {
if (!url) return null;
const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?]+)/);
return match ? match[1] : null;
};

// 2. Add state for the new form
const [youtubeUrl, setYoutubeUrl] = useState('');
const [youtubeLabel, setYoutubeLabel] = useState('');

// 3. Add the submission handler
const handleAddYoutubeVideo = async () => {
const videoId = extractYouTubeId(youtubeUrl);
if (!videoId) {
addToast('Invalid YouTube URL', 'error');
return;
}
if (!youtubeLabel) {
addToast('Please provide a label (e.g., "Cozy Cafe")', 'error');
return;
}

try {
const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

    const newPreset = {
      id: youtubeUrl, // Store raw URL as ID so DashboardView can parse it
      url: youtubeUrl,
      label: youtubeLabel,
      thumbnailUrl: thumbnailUrl,
      active: true,
      accessLevel: 'public',
      betaUsers: [],
      createdAt: Date.now(),
    };

    // Make sure to import addDoc, collection, db if not already present
    await addDoc(collection(db, 'background_presets'), newPreset);

    addToast('YouTube Background added successfully', 'success');
    setYoutubeUrl('');
    setYoutubeLabel('');

} catch (error) {
console.error('Failed to add YouTube background:', error);
addToast('Failed to add video background', 'error');
}
};

// 4. Add the UI below the existing Image Upload section

<div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm mt-6">
  <h3 className="text-lg font-bold text-slate-800 mb-4">Add Ambient YouTube Video</h3>
  <div className="flex flex-col gap-4 max-w-md">
    <input
      type="text"
      placeholder="YouTube URL (e.g., [https://www.youtube.com/watch?v=](https://www.youtube.com/watch?v=)...)"
      value={youtubeUrl}
      onChange={(e) => setYoutubeUrl(e.target.value)}
      className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-brand-blue-primary"
    />
    <input
      type="text"
      placeholder="Label (e.g., 'Cozy Rain Cafe')"
      value={youtubeLabel}
      onChange={(e) => setYoutubeLabel(e.target.value)}
      className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-brand-blue-primary"
    />
    <button
      onClick={handleAddYoutubeVideo}
      disabled={!youtubeUrl || !youtubeLabel}
      className="bg-brand-blue-primary text-white px-4 py-2 rounded-lg font-bold hover:bg-brand-blue-dark transition-colors disabled:opacity-50"
    >
      Add Video Preset
    </button>
  </div>
</div>
Step 4: The Sidebar RefactorFile: components/layout/sidebar/SidebarBackgrounds.tsxRewrite this component completely to support the new tabs and Google Drive history fetching.import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Upload, Loader2, Grid, Image as ImageIcon, Video } from 'lucide-react';
import { useBackgrounds } from '@/hooks/useBackgrounds';
import { useGoogleDrive } from '@/hooks/useGoogleDrive';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';

// Helper to identify YouTube links
const extractYouTubeId = (url: string) => {
if (!url) return null;
const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?]+)/);
return match ? match[1] : null;
};

interface SidebarBackgroundsProps {
isVisible: boolean;
}

export const SidebarBackgrounds: React.FC<SidebarBackgroundsProps> = ({ isVisible }) => {
const { presets, colors, gradients } = useBackgrounds();

// NEW: Use Google Drive instead of useStorage
const { uploadBackgroundToDrive, getUserBackgroundsFromDrive, isInitialized } = useGoogleDrive();

const { user } = useAuth();
const { activeDashboard, setBackground, addToast } = useDashboard();

const [designTab, setDesignTab] = useState<'media' | 'colors' | 'my-backgrounds'>('media');

// My Uploads State
const [userUploads, setUserUploads] = useState<string[]>([]);
const [loadingUploads, setLoadingUploads] = useState(false);
const [uploading, setUploading] = useState(false);
const [hasFetchedDrive, setHasFetchedDrive] = useState(false);
const fileInputRef = useRef<HTMLInputElement>(null);

// Auto-sort Admin Presets into Images and Videos
const { imagePresets, videoPresets } = useMemo(() => {
return presets.reduce((acc, bg) => {
if (extractYouTubeId(bg.id)) {
acc.videoPresets.push(bg);
} else {
acc.imagePresets.push(bg);
}
return acc;
}, { imagePresets: [] as typeof presets, videoPresets: [] as typeof presets });
}, [presets]);

// Fetch past uploads from Google Drive when tab is opened
useEffect(() => {
if (designTab === 'my-backgrounds' && isInitialized && !hasFetchedDrive) {
setLoadingUploads(true);
getUserBackgroundsFromDrive()
.then(urls => {
setUserUploads(urls);
setHasFetchedDrive(true);
})
.catch(() => addToast('Failed to load past backgrounds from Drive', 'error'))
.finally(() => setLoadingUploads(false));
}
}, [designTab, isInitialized, hasFetchedDrive]);

const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
const file = e.target.files?.[0];
if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      addToast('Image too large (Max 5MB)', 'error');
      return;
    }

    if (!isInitialized) {
      addToast('Google Drive is not initialized', 'error');
      return;
    }

    setUploading(true);
    try {
      const downloadURL = await uploadBackgroundToDrive(file);
      setBackground(downloadURL);
      // Immediately push to local list so they see it
      setUserUploads(prev => [downloadURL, ...prev]);
      addToast('Custom background saved to Drive', 'success');
    } catch (error) {
      console.error('Upload failed:', error);
      const message = error instanceof Error ? error.message : 'Upload failed';
      addToast(message, 'error');
    } finally {
      setUploading(false);
      // Reset input so the same file can be uploaded again if needed
      if (fileInputRef.current) fileInputRef.current.value = '';
    }

};

return (
<div
className={`absolute inset-0 p-4 flex flex-col gap-4 overflow-y-auto custom-scrollbar transition-all duration-300 ease-in-out ${
        isVisible ? 'translate-x-0 opacity-100 visible' : 'translate-x-full opacity-0 invisible'
      }`} >
<div className="flex bg-slate-100 p-0.5 rounded-lg text-xxs font-bold uppercase tracking-widest shrink-0">
<button
onClick={() => setDesignTab('media')}
className={`flex-1 py-1.5 rounded-md transition-all ${designTab === 'media' ? 'bg-white shadow-sm text-brand-blue-primary' : 'text-slate-500'}`} >
Media
</button>
<button
onClick={() => setDesignTab('colors')}
className={`flex-1 py-1.5 rounded-md transition-all ${designTab === 'colors' ? 'bg-white shadow-sm text-brand-blue-primary' : 'text-slate-500'}`} >
Colors
</button>
<button
onClick={() => setDesignTab('my-backgrounds')}
className={`flex-1 py-1.5 rounded-md transition-all ${designTab === 'my-backgrounds' ? 'bg-white shadow-sm text-brand-blue-primary' : 'text-slate-500'}`} >
My Uploads
</button>
</div>

      {designTab === 'media' && (
        <div className="flex flex-col gap-6 pb-4">
          {imagePresets.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1"><ImageIcon className="w-3 h-3"/> Images</h3>
              <div className="grid grid-cols-2 gap-2">
                {imagePresets.map((bg) => (
                  <button
                    key={bg.id}
                    onClick={() => setBackground(bg.id)}
                    className={`group relative aspect-video rounded-lg overflow-hidden border transition-all ${
                      activeDashboard?.background === bg.id ? 'border-brand-blue-primary ring-2 ring-brand-blue-lighter' : 'border-slate-200'
                    }`}
                  >
                    <img src={bg.thumbnailUrl ?? bg.id} alt={bg.label} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <span className="text-white text-xxxs font-bold uppercase px-1 text-center">{bg.label}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {videoPresets.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1"><Video className="w-3 h-3"/> Ambient Videos</h3>
              <div className="grid grid-cols-2 gap-2">
                {videoPresets.map((bg) => (
                  <button
                    key={bg.id}
                    onClick={() => setBackground(bg.id)}
                    className={`group relative aspect-video rounded-lg overflow-hidden border transition-all ${
                      activeDashboard?.background === bg.id ? 'border-brand-blue-primary ring-2 ring-brand-blue-lighter' : 'border-slate-200'
                    }`}
                  >
                    <img src={bg.thumbnailUrl ?? bg.id} alt={bg.label} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <span className="text-white text-xxxs font-bold uppercase px-1 text-center">{bg.label}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {designTab === 'colors' && (
        <div className="flex flex-col gap-6 pb-4">
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-slate-500 uppercase">Solid Colors</h3>
            <div className="grid grid-cols-3 gap-2">
              {colors.map((bg) => (
                <button
                  key={bg.id}
                  onClick={() => setBackground(bg.id)}
                  className={`aspect-square rounded-lg border transition-all relative ${bg.id} ${
                    activeDashboard?.background === bg.id ? 'border-brand-blue-primary ring-2 ring-brand-blue-lighter' : 'border-slate-200'
                  }`}
                >
                  {bg.label === 'Dot Grid' && <Grid className="w-4 h-4 absolute inset-0 m-auto text-slate-300" />}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-xs font-bold text-slate-500 uppercase">Gradients</h3>
            <div className="grid grid-cols-2 gap-2">
              {gradients.map((bg) => (
                <button
                  key={bg.id}
                  onClick={() => setBackground(bg.id)}
                  className={`aspect-video rounded-lg border transition-all relative ${
                    activeDashboard?.background === bg.id ? 'border-brand-blue-primary ring-2 ring-brand-blue-lighter' : 'border-slate-200'
                  }`}
                >
                  <div className={`w-full h-full rounded-md ${bg.id}`} />
                  <div className="absolute bottom-1.5 left-1.5 text-xxxs font-bold uppercase text-white drop-shadow-md">{bg.label}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {designTab === 'my-backgrounds' && (
        <div className="flex flex-col gap-4 pb-4">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || !isInitialized}
            className="w-full py-8 rounded-lg border-2 border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400 hover:border-brand-blue-primary hover:text-brand-blue-primary hover:bg-slate-50 transition-all disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <>
                <Upload className="w-6 h-6 mb-2" />
                <span className="text-xs font-bold uppercase tracking-wide">Upload Image</span>
              </>
            )}
          </button>

          {loadingUploads ? (
            <div className="flex justify-center p-4">
              <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
            </div>
          ) : userUploads.length > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              {userUploads.map((url, i) => (
                <button
                  key={i}
                  onClick={() => setBackground(url)}
                  className={`aspect-video rounded-lg overflow-hidden border ${
                    activeDashboard?.background === url ? 'border-brand-blue-primary ring-2 ring-brand-blue-lighter' : 'border-slate-200'
                  }`}
                >
                  <img src={url} alt="User Upload" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          ) : (
            <p className="text-center text-xs text-slate-400 mt-2">
              Custom images you upload will be saved securely to your Google Drive.
            </p>
          )}
        </div>
      )}

      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept="image/*"
        onChange={(e) => void handleFileUpload(e)}
      />
    </div>

);
};
