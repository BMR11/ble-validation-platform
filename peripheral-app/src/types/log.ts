export interface LogEntry {
  id: string;
  timestamp: string;
  type: 'info' | 'success' | 'error' | 'event' | 'native';
  message: string;
}
