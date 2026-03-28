import { FlatList, Text, TouchableOpacity, View } from 'react-native';
import type { LogEntry } from '../types/log';
import { appStyles } from '../styles/appStyles';
import { LogItemRow } from './LogItemRow';

export function DebugLogPanel({
  logs,
  onClear,
}: {
  logs: LogEntry[];
  onClear: () => void;
}) {
  return (
    <View style={appStyles.logsContainer}>
      <View style={appStyles.logsHeader}>
        <Text style={appStyles.logsTitle}>Logs ({logs.length})</Text>
        <TouchableOpacity onPress={onClear}>
          <Text style={appStyles.clearButton}>Clear</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={logs}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <LogItemRow item={item} />}
        style={appStyles.logsList}
        contentContainerStyle={appStyles.logsListContent}
      />
    </View>
  );
}
