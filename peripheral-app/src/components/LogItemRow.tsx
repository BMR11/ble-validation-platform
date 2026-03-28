import { Text, View } from 'react-native';
import type { LogEntry } from '../types/log';
import { appStyles } from '../styles/appStyles';

const LOG_COLORS: Record<LogEntry['type'], string> = {
  info: '#7a9eb8',
  success: '#7a9e8a',
  error: '#b89088',
  event: '#9a90b0',
  native: '#a89a6e',
};

export function LogItemRow({ item }: { item: LogEntry }) {
  return (
    <View style={appStyles.logItem}>
      <Text style={[appStyles.logType, { color: LOG_COLORS[item.type] }]}>
        [{item.timestamp}]
      </Text>
      <Text style={appStyles.logMessage}>{item.message}</Text>
    </View>
  );
}
