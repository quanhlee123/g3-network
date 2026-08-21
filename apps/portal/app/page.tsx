// F-E1 — Trang gốc chỉ là ngã rẽ: có phiên thì vào thẳng màn hình tổng quan.
// Yêu cầu thiết kế sheet 2 (Hành trình 2 bước 1): "Trang chủ = 1 màn hình tổng quan,
// không cần click sâu" — nên không có trang chào nào chen giữa.
import { redirect } from 'next/navigation';
import { docPhien } from '../lib/phien';

export default async function TrangGoc() {
  redirect((await docPhien()) ? '/tong-quan' : '/dang-nhap');
}
