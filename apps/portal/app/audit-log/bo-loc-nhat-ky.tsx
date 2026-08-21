// F-F1 — Bộ lọc nhật ký truy cập. Là <form method="GET">: bộ lọc nằm trong URL nên gửi
// được cho Legal/thanh tra dưới dạng một đường link tái lập được đúng kết quả.
'use client';

import { useRouter } from 'next/navigation';

export function BoLocNhatKy({
  vin,
  action,
  from,
  to,
}: {
  vin: string;
  action: string;
  from: string;
  to: string;
}) {
  const router = useRouter();

  return (
    <form
      style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}
      onSubmit={(e) => {
        e.preventDefault();
        const d = new FormData(e.currentTarget);
        const p = new URLSearchParams();
        for (const ten of ['vin', 'action', 'from', 'to']) {
          const v = String(d.get(ten) ?? '').trim();
          if (v !== '') p.set(ten, v);
        }
        router.push(p.toString() === '' ? '/audit-log' : `/audit-log?${p.toString()}`);
      }}
    >
      <div style={{ flex: '1 1 220px' }}>
        <label htmlFor="vin">Xe (VIN)</label>
        <input id="vin" name="vin" type="search" defaultValue={vin} placeholder="G3-SIM-VIN-0007" />
      </div>
      <div style={{ flex: '0 1 200px' }}>
        <label htmlFor="action">Kết quả</label>
        <select id="action" name="action" defaultValue={action}>
          <option value="">Tất cả</option>
          <option value="vehicle_location.read">Đã xem được</option>
          <option value="vehicle_location.denied">Bị từ chối</option>
        </select>
      </div>
      <div style={{ flex: '0 1 170px' }}>
        <label htmlFor="from">Từ ngày</label>
        <input id="from" name="from" type="date" defaultValue={from} />
      </div>
      <div style={{ flex: '0 1 170px' }}>
        <label htmlFor="to">Đến ngày</label>
        <input id="to" name="to" type="date" defaultValue={to} />
      </div>
      <button type="submit">Lọc</button>
      {(vin !== '' || action !== '' || from !== '' || to !== '') && (
        <button
          type="button"
          className="phu"
          onClick={() => {
            router.push('/audit-log');
          }}
        >
          Xoá lọc
        </button>
      )}
    </form>
  );
}
