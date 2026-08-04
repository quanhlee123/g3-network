// F-F2 — Server Action cho luồng kích hoạt thiết bị theo VIN.
'use server';

import { revalidatePath } from 'next/cache';
import { goiApi } from '../../lib/api';
import type { PhienKichHoat, TrangThaiTelemetry } from '../../lib/api-kich-hoat';

export interface KetQua<T> {
  ok: boolean;
  message: string;
  data?: T;
}

export async function batDauTheoVin(
  _truoc: KetQua<PhienKichHoat> | null,
  form: FormData,
): Promise<KetQua<PhienKichHoat>> {
  const vin = String(form.get('vin') ?? '').trim();
  const kq = await goiApi<PhienKichHoat>('/provisioning', { method: 'POST', body: { vin } });
  if (!kq.ok) return { ok: false, message: kq.loi.message };
  revalidatePath('/kich-hoat');
  return { ok: true, message: `Đã mở phiên kích hoạt cho xe ${kq.data.vin}.`, data: kq.data };
}

export async function ganThietBi(
  phienId: string,
  serial: string,
  firmware: string,
  iccid: string,
): Promise<KetQua<PhienKichHoat>> {
  const kq = await goiApi<PhienKichHoat>(`/provisioning/${phienId}/thiet-bi`, {
    method: 'POST',
    body: {
      device_serial: serial,
      ...(firmware.trim() === '' ? {} : { firmware_version: firmware.trim() }),
      ...(iccid.trim() === '' ? {} : { sim_iccid: iccid.trim() }),
    },
  });
  if (!kq.ok) return { ok: false, message: kq.loi.message };
  revalidatePath(`/kich-hoat/${phienId}`);
  return { ok: true, message: `Đã gán thiết bị ${serial}.`, data: kq.data };
}

export async function ghiConsent(
  phienId: string,
  driverId: string,
  version: string,
): Promise<KetQua<PhienKichHoat>> {
  const kq = await goiApi<{ phien: PhienKichHoat; canh_bao_phap_ly: string | null }>(
    `/provisioning/${phienId}/consent`,
    { method: 'POST', body: { driver_id: driverId, consent_version: version } },
  );
  if (!kq.ok) return { ok: false, message: kq.loi.message };
  revalidatePath(`/kich-hoat/${phienId}`);
  return {
    ok: true,
    // Cảnh báo pháp lý của API phải đi thẳng lên màn hình, không được nuốt.
    message: kq.data.canh_bao_phap_ly ?? 'Đã ghi nhận tài xế đồng ý.',
    data: kq.data.phien,
  };
}

/** Bước 4: màn hình gọi lại hàm này vài giây một lần cho tới khi có tick xanh. */
export async function kiemTraTelemetry(phienId: string): Promise<KetQua<TrangThaiTelemetry>> {
  const kq = await goiApi<TrangThaiTelemetry>(`/provisioning/${phienId}/telemetry`);
  if (!kq.ok) return { ok: false, message: kq.loi.message };
  if (kq.data.da_ve) revalidatePath(`/kich-hoat/${phienId}`);
  return { ok: true, message: '', data: kq.data };
}

export async function hoanTat(phienId: string): Promise<KetQua<PhienKichHoat>> {
  const kq = await goiApi<PhienKichHoat>(`/provisioning/${phienId}/hoan-tat`, { method: 'POST' });
  if (!kq.ok) return { ok: false, message: kq.loi.message };
  revalidatePath(`/kich-hoat/${phienId}`);
  revalidatePath('/kich-hoat');
  return {
    ok: true,
    message: 'Kích hoạt thành công. In checklist bàn giao cho tài xế ký.',
    data: kq.data,
  };
}

export async function danhDauHong(
  phienId: string,
  lyDo: string,
  laHuy: boolean,
): Promise<KetQua<PhienKichHoat>> {
  const kq = await goiApi<PhienKichHoat>(`/provisioning/${phienId}/that-bai`, {
    method: 'POST',
    body: { ly_do: lyDo, la_huy: laHuy },
  });
  if (!kq.ok) return { ok: false, message: kq.loi.message };
  revalidatePath(`/kich-hoat/${phienId}`);
  revalidatePath('/kich-hoat');
  return { ok: true, message: laHuy ? 'Đã huỷ phiên.' : 'Đã ghi nhận thất bại.', data: kq.data };
}
