// F-E1 — Ô lọc/tìm xe. Là <form method="GET"> thuần: bộ lọc nằm trong URL nên chia sẻ
// link được và F5 không mất, đồng thời vẫn chạy khi JavaScript chưa kịp tải.
'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

const DONG_XE = ['EVT-262', 'EVT-400', 'EVT-825'];

export function BoLocXe({ q, model }: { q: string; model: string }) {
  const router = useRouter();
  const duongDan = usePathname();
  const thamSo = useSearchParams();

  function dat(ten: string, giaTri: string) {
    const moi = new URLSearchParams(thamSo.toString());
    if (giaTri === '') moi.delete(ten);
    else moi.set(ten, giaTri);
    router.push(`${duongDan}?${moi.toString()}`);
  }

  return (
    <form
      style={{
        display: 'flex',
        gap: 12,
        flexWrap: 'wrap',
        alignItems: 'flex-end',
        margin: '4px 0 18px',
      }}
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        dat('q', String(data.get('q') ?? '').trim());
      }}
    >
      <div style={{ flex: '1 1 240px' }}>
        <label htmlFor="q">Tìm theo VIN</label>
        <input id="q" name="q" type="search" defaultValue={q} placeholder="vd G3-SIM-0007" />
      </div>
      <div style={{ flex: '0 1 200px' }}>
        <label htmlFor="model">Dòng xe</label>
        <select
          id="model"
          name="model"
          defaultValue={model}
          onChange={(e) => {
            dat('model', e.target.value);
          }}
        >
          <option value="">Tất cả</option>
          {DONG_XE.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>
      <button type="submit">Tìm</button>
      {(q !== '' || model !== '') && (
        <button
          type="button"
          className="phu"
          onClick={() => {
            router.push(duongDan);
          }}
        >
          Xoá lọc
        </button>
      )}
    </form>
  );
}
