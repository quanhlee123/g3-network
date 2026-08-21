// F-F2 — Nút in checklist bàn giao (window.print chỉ chạy trên trình duyệt).
'use client';

export function NutIn() {
  return (
    <button
      type="button"
      onClick={() => {
        window.print();
      }}
    >
      In checklist bàn giao
    </button>
  );
}
