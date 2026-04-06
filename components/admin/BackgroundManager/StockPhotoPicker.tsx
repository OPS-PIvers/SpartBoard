import React, { useState, useEffect, useCallback } from 'react';
import { Search, Loader2, ImageOff } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { useDebounce } from '@/hooks/useDebounce';
import {
  searchPhotos,
  getCuratedPhotos,
  type PexelsPhoto,
} from '@/utils/pexelsService';

export interface StockPhotoSelection {
  url: string;
  thumbnailUrl: string;
  label: string;
  photographer: string;
}

interface StockPhotoPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPhoto: (photo: StockPhotoSelection) => void;
}

export const StockPhotoPicker: React.FC<StockPhotoPickerProps> = ({
  isOpen,
  onClose,
  onSelectPhoto,
}) => {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 400);
  const [photos, setPhotos] = useState<PexelsPhoto[]>([]);
  const [page, setPage] = useState(1);
  const [totalResults, setTotalResults] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPhotos = useCallback(
    async (searchQuery: string, pageNum: number, append: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const result = searchQuery.trim()
          ? await searchPhotos(searchQuery, pageNum)
          : await getCuratedPhotos(pageNum);
        setPhotos((prev) =>
          append ? [...prev, ...result.photos] : result.photos
        );
        setTotalResults(result.total_results);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load photos');
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!isOpen) return;
    setPage(1);
    void fetchPhotos(debouncedQuery, 1, false);
  }, [debouncedQuery, isOpen, fetchPhotos]);

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    void fetchPhotos(debouncedQuery, nextPage, true);
  };

  const handleSelect = (photo: PexelsPhoto) => {
    onSelectPhoto({
      url: photo.src.large2x,
      thumbnailUrl: photo.src.medium,
      label: photo.alt || `Photo by ${photo.photographer}`,
      photographer: photo.photographer,
    });
  };

  const hasMore = photos.length < totalResults;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Stock Photos"
      maxWidth="max-w-4xl"
      contentClassName="px-0"
      footer={
        <p className="text-xs text-slate-400 text-center">
          Photos provided by{' '}
          <a
            href="https://www.pexels.com"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-slate-300"
          >
            Pexels
          </a>
        </p>
      }
    >
      <div className="flex flex-col" style={{ maxHeight: '70vh' }}>
        {/* Search bar */}
        <div className="px-6 pb-4">
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search photos (e.g. classroom, nature, chalkboard)..."
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue-light focus:border-transparent"
            />
          </div>
        </div>

        {/* Photo grid */}
        <div className="flex-1 overflow-y-auto px-6">
          {error && (
            <div className="text-center py-8 text-red-500 text-sm">{error}</div>
          )}

          {!error && photos.length === 0 && !loading && (
            <div className="text-center py-12 text-slate-400">
              <ImageOff size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">No photos found</p>
            </div>
          )}

          {photos.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {photos.map((photo) => (
                <button
                  key={photo.id}
                  onClick={() => handleSelect(photo)}
                  className="group relative aspect-video rounded-lg overflow-hidden border-2 border-transparent hover:border-brand-blue-light transition-all focus:outline-none focus:ring-2 focus:ring-brand-blue-light"
                >
                  <img
                    src={photo.src.medium}
                    alt={photo.alt}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <p className="text-white text-xs truncate">
                      {photo.photographer}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Loading spinner */}
          {loading && (
            <div className="flex justify-center py-6">
              <Loader2 size={24} className="animate-spin text-slate-400" />
            </div>
          )}

          {/* Load more */}
          {!loading && hasMore && photos.length > 0 && (
            <div className="flex justify-center py-4">
              <button
                onClick={handleLoadMore}
                className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-medium transition-colors"
              >
                Load More
              </button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
