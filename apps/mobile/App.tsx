// Khung TRỐNG (Prompt 01, chưa gắn F-xx) — app tài xế.
// Màn hình thật chỉ build ở Prompt 09, SAU KHI quyết định D-01 trong docs/DECISION-LOG.md
// được chốt "Có" (hiện đang MỞ). Ưu tiên Android tầm trung (NF-13).
import { Text, View } from 'react-native';

export default function App() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#111111' }}>
        G3 Network — App tài xế (khung trống)
      </Text>
    </View>
  );
}
