import { useRef } from 'react';
import { useI18n } from '../i18n';

export interface PhotoDraft {
  data: string; // base64（不含 data: 前缀）
  mime: string;
  preview: string; // dataURL 用于预览
}

const MAX_PHOTOS = 3;
const MAX_EDGE = 1280;
const JPEG_QUALITY = 0.72;

// 压缩：最长边 ≤1280px，JPEG 输出，手机原图 3-8MB → 约 100-300KB
async function compressImage(file: File): Promise<PhotoDraft> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  return {
    data: dataUrl.slice(dataUrl.indexOf(',') + 1),
    mime: 'image/jpeg',
    preview: dataUrl,
  };
}

export default function PhotoInput({
  photos,
  onChange,
}: {
  photos: PhotoDraft[];
  onChange: (photos: PhotoDraft[]) => void;
}) {
  const { t } = useI18n();
  const cameraRef = useRef<HTMLInputElement>(null);
  const albumRef = useRef<HTMLInputElement>(null);

  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    const room = MAX_PHOTOS - photos.length;
    const picked = [...files].slice(0, room);
    const drafts = await Promise.all(picked.map(compressImage));
    onChange([...photos, ...drafts]);
    if (cameraRef.current) cameraRef.current.value = '';
    if (albumRef.current) albumRef.current.value = '';
  };

  return (
    <div className="photo-input">
      {/* capture="environment" 唤起后置摄像头；无 capture 的输入打开相册/文件选择 */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => onFiles(e.target.files)}
      />
      <input
        ref={albumRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => onFiles(e.target.files)}
      />
      <div className="photo-thumbs">
        {photos.map((p, i) => (
          <div className="photo-thumb" key={i}>
            <img src={p.preview} alt="" />
            <button
              type="button"
              className="photo-remove"
              aria-label={t('photo.remove')}
              onClick={() => onChange(photos.filter((_, idx) => idx !== i))}
            >
              ×
            </button>
          </div>
        ))}
        {photos.length < MAX_PHOTOS && (
          <>
            <button type="button" className="photo-add" onClick={() => cameraRef.current?.click()}>
              📷
              <span>{t('photo.take')}</span>
            </button>
            <button type="button" className="photo-add" onClick={() => albumRef.current?.click()}>
              🖼
              <span>{t('photo.album')}</span>
            </button>
          </>
        )}
      </div>
      <div className="photo-hint">{t('photo.hint', { n: MAX_PHOTOS })}</div>
    </div>
  );
}
