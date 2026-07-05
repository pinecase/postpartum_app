import { useEffect, useState } from 'react';
import { api, PhotoRef } from '../api';
import { useI18n } from '../i18n';

interface FullPhoto {
  id: number;
  mime: string;
  data: string;
  created_at: string;
  recorded_by: string | null;
}

/** 表格里的 📷n 角标；点击加载并弹出大图 */
export function PhotoBadge({ refs }: { refs: PhotoRef[] }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  if (!refs.length) return null;
  return (
    <>
      <button type="button" className="photo-badge" onClick={() => setOpen(true)}>
        📷{refs.length}
      </button>
      {open && <Viewer refs={refs} onClose={() => setOpen(false)} title={t('photo.photos')} />}
    </>
  );
}

function Viewer({ refs, onClose, title }: { refs: PhotoRef[]; onClose: () => void; title: string }) {
  const { t } = useI18n();
  const [photos, setPhotos] = useState<FullPhoto[] | null>(null);

  useEffect(() => {
    Promise.all(refs.map((r) => api.get<FullPhoto>(`/api/photos/${r.id}`))).then(setPhotos);
  }, [refs]);

  return (
    <div className="modal-mask" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal photo-viewer">
        <h3>
          {title}
          <button type="button" className="btn btn-sm" onClick={onClose} style={{ float: 'right' }}>
            ✕
          </button>
        </h3>
        {!photos && <div className="empty">{t('common.loading')}</div>}
        {photos?.map((p) => (
          <figure key={p.id}>
            <img src={`data:${p.mime};base64,${p.data}`} alt="" />
            <figcaption className="meta">
              {p.created_at.slice(0, 16).replace('T', ' ')}
              {p.recorded_by ? ` · ${p.recorded_by}` : ''}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
