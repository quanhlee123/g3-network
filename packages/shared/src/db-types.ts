// ⚠️ File SINH TỰ ĐỘNG từ schema DB bằng `npm run db:types` (F-G4) — KHÔNG sửa tay.
// Quy ước kiểu theo node-postgres: numeric/bigint = string, timestamptz = Date, jsonb = unknown.

export type AlertStatus = 'open' | 'acknowledged' | 'resolved';
export type AlertType =
  | 'battery_low'
  | 'battery_critical'
  | 'battery_anomaly'
  | 'charging_violation'
  | 'device_offline'
  | 'device_tamper'
  | 'geofence'
  | 'maintenance'
  | 'data_quality'
  | 'reconciliation_mismatch'
  | 'sos'
  | 'sla_breach';
export type AnomalyKind = 'nhiet_do_cao' | 'sut_ap_dot_ngot' | 'ma_loi_bms';
export type ConnectorStatus = 'Available' | 'Charging' | 'Faulted' | 'Unavailable';
export type DevicePowerStatus = 'normal' | 'low' | 'lost';
export type NotificationChannel = 'push' | 'in_app' | 'sms';
export type NotificationStatus = 'sent' | 'failed' | 'suppressed';
export type OcppTransactionStatus = 'open' | 'closed';
export type PaymentMethod = 'vnpay' | 'momo' | 'wallet';
export type PaymentStatus = 'pending' | 'succeeded' | 'failed' | 'refunded';
export type PolicyScope = 'vehicle' | 'fleet' | 'model';
export type ReconciliationStatus = 'khop' | 'lech' | 'thieu_du_lieu';
export type RiskLevel = 'low' | 'medium' | 'high';
export type ServicePlan = 'basic' | 'standard';
export type StationStatus = 'active' | 'maintenance' | 'inactive';
export type TicketChannel = 'in_app' | 'hotline' | 'zalo' | 'sos';
export type TicketPriority = 'thap' | 'binh_thuong' | 'cao' | 'khan_cap';
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type UserRole =
  'driver' | 'fleet_manager' | 'energy_ops' | 'warranty_admin' | 'cskh' | 'admin' | 'sale';
export type VehicleModel = 'EVT-262' | 'EVT-400' | 'EVT-825';
export type ViolationType =
  | 'outside_hours'
  | 'soc_above_max'
  | 'soc_below_min'
  | 'overpower'
  | 'fast_charge_excess'
  | 'duration_exceeded';
export type WarrantyState = 'active' | 'at_risk' | 'void';

export interface AlertsRow {
  id: string;
  type: AlertType;
  vehicle_id: string | null;
  device_id: string | null;
  severity: number;
  dedup_key: string | null;
  payload: unknown | null;
  status: AlertStatus;
  triggered_at: Date;
  resolved_at: Date | null;
}

export interface AnomalyRulesRow {
  id: string;
  kind: AnomalyKind;
  customer_id: string | null;
  vehicle_id: string | null;
  nguong_so: string | null;
  bien_tre_so: string;
  cua_so_giay: number | null;
  ma_loi: string[] | null;
  severity: number;
  enabled: boolean;
  updated_at: Date;
}

export interface AuditLogsRow {
  id: string;
  user_id: string;
  action: string;
  vehicle_id: string | null;
  reason: string;
  ticket_id: string | null;
  metadata: unknown | null;
  occurred_at: Date;
}

export interface AuthOtpChallengesRow {
  id: string;
  phone: string;
  code_hash: string;
  user_id: string | null;
  attempts: number;
  expires_at: Date;
  consumed_at: Date | null;
  created_at: Date;
}

export interface BatteriesRow {
  id: string;
  pack_id: string;
  vehicle_id: string;
  chemistry: string;
  capacity_kwh: string;
  soh_pct: string | null;
  cycle_count: number;
  created_at: Date;
}

export interface BatteryAlertThresholdsRow {
  id: string;
  customer_id: string | null;
  vehicle_id: string | null;
  muc: string;
  nguong_pct: string;
  bien_tre_pct: string;
  updated_at: Date;
}

export interface ChargingPoliciesRow {
  id: string;
  code: string;
  version: number;
  name: string;
  scope_type: PolicyScope;
  vehicle_id: string | null;
  customer_id: string | null;
  vehicle_model: VehicleModel | null;
  soc_min_pct: string | null;
  soc_max_pct: string | null;
  allowed_hours: unknown | null;
  max_power_kw: string | null;
  max_duration_minutes: number | null;
  max_sessions_per_day: number | null;
  effective_from: Date;
  effective_to: Date | null;
  created_at: Date;
}

export interface ChargingSessionsRow {
  id: string;
  vehicle_id: string;
  station_id: string;
  connector_id: string;
  ocpp_transaction_id: string | null;
  started_at: Date;
  ended_at: Date | null;
  energy_kwh: string | null;
  soc_start_pct: string | null;
  soc_end_pct: string | null;
  avg_power_kw: string | null;
  max_power_kw: string | null;
  cost_vnd: string | null;
  recorded_at: Date;
}

export interface ChargingStationsRow {
  id: string;
  code: string;
  name: string;
  location: string;
  area: string | null;
  total_power_kw: string | null;
  connector_standard: string;
  status: StationStatus;
  operating_hours: string | null;
  created_at: Date;
}

export interface ConnectorsRow {
  id: string;
  station_id: string;
  ocpp_connector_id: number;
  max_power_kw: string;
  standard: string;
  status: ConnectorStatus;
  updated_at: Date;
}

export interface CustomersRow {
  id: string;
  name: string;
  contract_no: string | null;
  service_plan: ServicePlan;
  created_at: Date;
}

export interface DevicesRow {
  id: string;
  device_serial: string;
  vehicle_id: string | null;
  firmware_version: string | null;
  sim_iccid: string | null;
  mtls_identity: string | null;
  revoked_at: Date | null;
  last_seen_at: Date | null;
  power_status: DevicePowerStatus;
  created_at: Date;
}

export interface DriversRow {
  id: string;
  user_id: string;
  phone: string | null;
  license_no: string | null;
  consent_at: Date | null;
  consent_version: string | null;
  created_at: Date;
}

export interface GeofenceStatesRow {
  geofence_id: string;
  vehicle_id: string;
  ben_trong: boolean;
  cap_nhat_luc: Date;
}

export interface GeofencesRow {
  id: string;
  code: string;
  name: string;
  customer_id: string | null;
  vehicle_id: string | null;
  vung: string;
  canh_bao_vao: boolean;
  canh_bao_ra: boolean;
  enabled: boolean;
  created_at: Date;
}

export interface NotificationPrefsRow {
  id: string;
  alert_type: AlertType;
  role: UserRole;
  channels: NotificationChannel[];
  min_severity: number;
  updated_at: Date;
}

export interface NotificationsRow {
  id: string;
  user_id: string;
  channel: NotificationChannel;
  status: NotificationStatus;
  alert_id: string | null;
  ticket_id: string | null;
  alert_type: AlertType;
  severity: number;
  title: string;
  body: string;
  data: unknown | null;
  error: string | null;
  read_at: Date | null;
  created_at: Date;
}

export interface OcppTransactionsRow {
  transaction_id: number;
  station_id: string;
  connector_id: string;
  vehicle_id: string;
  id_tag: string;
  meter_start_wh: number;
  soc_start_pct: string | null;
  started_at: Date;
  last_meter_wh: number | null;
  last_soc_pct: string | null;
  max_power_kw: string | null;
  status: OcppTransactionStatus;
  created_at: Date;
  closed_at: Date | null;
}

export interface PaymentTransactionsRow {
  id: string;
  session_id: string | null;
  subscription_ref: string | null;
  method: PaymentMethod;
  amount_vnd: string;
  status: PaymentStatus;
  gateway_ref: string | null;
  gateway_webhook_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface PushTokensRow {
  id: string;
  user_id: string;
  token: string;
  platform: string;
  revoked_at: Date | null;
  created_at: Date;
}

export interface ReconciliationResultsRow {
  id: string;
  session_id: string;
  vehicle_id: string;
  station_id: string;
  kwh_tru: string | null;
  kwh_xe: string | null;
  kwh_thanh_toan: string | null;
  so_tien_vnd: string | null;
  lech_xe_pct: string | null;
  lech_tien_pct: string | null;
  lech_max_pct: string | null;
  nguong_pct: string;
  status: ReconciliationStatus;
  ghi_chu: string | null;
  alert_id: string | null;
  checked_at: Date;
}

export interface TelematicsReadingsRow {
  time: Date;
  vehicle_id: string;
  device_id: string | null;
  schema_version: number;
  soc_pct: string | null;
  soh_pct: string | null;
  battery_voltage_v: string | null;
  battery_temp_c: string | null;
  motor_temp_c: string | null;
  charge_current_a: string | null;
  speed_kmh: string | null;
  odometer_km: string | null;
  position: string | null;
  fault_codes: unknown | null;
  supply_voltage_v: string | null;
  signal_dbm: number | null;
}

export interface TelemetryQuarantineRow {
  id: string;
  received_at: Date;
  topic: string;
  raw_payload: string;
  schema_version: number | null;
  reason: string;
  created_at: Date;
}

export interface TicketsRow {
  id: string;
  channel: TicketChannel;
  status: TicketStatus;
  title: string;
  description: string | null;
  created_by: string | null;
  assigned_to: string | null;
  vehicle_id: string | null;
  vehicle_context: unknown | null;
  sla_due_at: Date | null;
  created_at: Date;
  resolved_at: Date | null;
  priority: TicketPriority;
  acknowledged_at: Date | null;
  acknowledged_by: string | null;
  escalated_at: Date | null;
}

export interface UsersRow {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  customer_id: string | null;
  is_active: boolean;
  created_at: Date;
  phone: string | null;
}

export interface VehiclesRow {
  id: string;
  vin: string;
  model: VehicleModel;
  customer_id: string;
  assigned_driver_id: string | null;
  handover_date: Date | null;
  warranty_state: WarrantyState;
  service_plan: ServicePlan;
  created_at: Date;
}

export interface ViolationsRow {
  id: string;
  vehicle_id: string;
  policy_id: string | null;
  session_id: string | null;
  type: ViolationType;
  evidence: unknown;
  risk_level: RiskLevel;
  detected_at: Date;
}

export interface DbSchema {
  alerts: AlertsRow;
  anomaly_rules: AnomalyRulesRow;
  audit_logs: AuditLogsRow;
  auth_otp_challenges: AuthOtpChallengesRow;
  batteries: BatteriesRow;
  battery_alert_thresholds: BatteryAlertThresholdsRow;
  charging_policies: ChargingPoliciesRow;
  charging_sessions: ChargingSessionsRow;
  charging_stations: ChargingStationsRow;
  connectors: ConnectorsRow;
  customers: CustomersRow;
  devices: DevicesRow;
  drivers: DriversRow;
  geofence_states: GeofenceStatesRow;
  geofences: GeofencesRow;
  notification_prefs: NotificationPrefsRow;
  notifications: NotificationsRow;
  ocpp_transactions: OcppTransactionsRow;
  payment_transactions: PaymentTransactionsRow;
  push_tokens: PushTokensRow;
  reconciliation_results: ReconciliationResultsRow;
  telematics_readings: TelematicsReadingsRow;
  telemetry_quarantine: TelemetryQuarantineRow;
  tickets: TicketsRow;
  users: UsersRow;
  vehicles: VehiclesRow;
  violations: ViolationsRow;
}
