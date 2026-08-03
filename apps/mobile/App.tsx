// F-D4 — điểm vào app tài xế. Ưu tiên Android tầm trung (NF-13), tiếng Việt (NF-12).
//
// ⚠️ PHẠM VI HIỆN TẠI: mới có KHUNG (cấu hình, tầng gọi API, luồng đăng nhập OTP,
// bảng điều hướng). CHƯA vẽ màn hình nào — bố cục chờ wireframe của Thiết kế theo
// chuẩn INPUT-03 §2, xem docs/design/YEU-CAU-WIREFRAME.md.
//
// D-01 (có app tài xế ở P1 không) ĐÃ CHỐT "CÓ" ngày 2026-08-03 — xem docs/DECISION-LOG.md.
import { useMemo } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { lapRapApp } from './src/app-deps';
import { BANG_MAN_HINH } from './src/navigation/routes';
import { VI } from './src/i18n';

export default function App() {
  const app = useMemo(() => lapRapApp(), []);
  const soManHinh = Object.keys(BANG_MAN_HINH).length;

  return (
    <ScrollView
      contentContainerStyle={{ padding: 24, paddingTop: 64, gap: 16 }}
      style={{ backgroundColor: '#FFFFFF' }}
    >
      <Text style={{ fontSize: 28, fontWeight: 'bold', color: '#111111' }}>
        {VI.chung.tenApp} — App tài xế
      </Text>

      <Text style={{ fontSize: 18, color: '#333333', lineHeight: 26 }}>
        Khung đã dựng xong: cấu hình, tầng gọi API, luồng đăng nhập OTP, bảng {soManHinh} màn hình.
        Giao diện từng màn hình chờ wireframe của Thiết kế.
      </Text>

      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 16, color: '#555555' }}>Máy chủ: {app.cauHinh.apiBaseUrl}</Text>
        {app.cauHinh.dungApiUrlMacDinh ? (
          <Text style={{ fontSize: 16, color: '#B00020', fontWeight: '600', lineHeight: 24 }}>
            Chưa khai EXPO_PUBLIC_API_URL — đang dùng địa chỉ của trình giả lập Android. Chạy trên
            điện thoại thật thì phải đổi sang IP LAN của máy chạy apps/api, nếu không app sẽ báo mất
            sóng.
          </Text>
        ) : null}
      </View>
    </ScrollView>
  );
}
