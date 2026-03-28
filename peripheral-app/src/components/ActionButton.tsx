import { Text, TouchableOpacity } from 'react-native';
import { appStyles } from '../styles/appStyles';

type Variant = 'default' | 'primary' | 'danger' | 'success';

/** Muted dark fills + thin border; low visual noise */
const VARIANT_STYLES: Record<
  Variant,
  { border: string; bg: string; text: string }
> = {
  default: { border: '#353b4a', bg: '#1e2129', text: '#d1d5db' },
  primary: { border: '#3d5a6e', bg: '#1a2430', text: '#b8d4e8' },
  danger: { border: '#5a4548', bg: '#221a1c', text: '#d4c4c4' },
  success: { border: '#3d5a48', bg: '#1a221f', text: '#c4d4c8' },
};

export function ActionButton({
  title,
  onPress,
  variant = 'default',
}: {
  title: string;
  onPress: () => void;
  variant?: Variant;
}) {
  const v = VARIANT_STYLES[variant];
  return (
    <TouchableOpacity
      style={[
        appStyles.button,
        { borderColor: v.border, backgroundColor: v.bg },
      ]}
      onPress={onPress}
      activeOpacity={0.72}
    >
      <Text style={[appStyles.buttonText, { color: v.text }]}>{title}</Text>
    </TouchableOpacity>
  );
}
