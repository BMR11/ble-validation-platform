import { Platform, StatusBar, StyleSheet } from 'react-native';

/** Soft drop shadow (iOS) / elevation (Android) */
const elevated = Platform.select({
  ios: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.55,
    shadowRadius: 8,
  },
  android: {
    elevation: 8,
  },
});

/** Subtle raised “plate”: light top/left edge, darker bottom/right */
const embossed = {
  borderTopWidth: StyleSheet.hairlineWidth,
  borderTopColor: '#3a4254',
  borderLeftWidth: StyleSheet.hairlineWidth,
  borderLeftColor: '#323846',
  borderRightWidth: StyleSheet.hairlineWidth,
  borderRightColor: '#14151a',
  borderBottomWidth: StyleSheet.hairlineWidth,
  borderBottomColor: '#0a0b0d',
};

const elevatedSoft = Platform.select({
  ios: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.45,
    shadowRadius: 5,
  },
  android: {
    elevation: 5,
  },
});

const embossedInset = {
  borderTopWidth: StyleSheet.hairlineWidth,
  borderTopColor: '#2f3544',
  borderLeftWidth: StyleSheet.hairlineWidth,
  borderLeftColor: '#2a2f3c',
  borderRightWidth: StyleSheet.hairlineWidth,
  borderRightColor: '#101116',
  borderBottomWidth: StyleSheet.hairlineWidth,
  borderBottomColor: '#08090b',
};

/** Readable UI sans; logs stay monospace */
const ui = Platform.select({
  ios: 'SF Pro Text',
  android: 'Roboto',
});

const mono = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
});

export const appTheme = {
  placeholder: '#6b7280',
};

export const appStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#12141a',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
    paddingBottom: Platform.OS === 'android' ? 24 : 0,
  },
  header: {
    ...elevated,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#16181f',
    ...embossed,
    marginBottom: 2,
    zIndex: 2,
  },
  title: {
    fontFamily: ui,
    fontSize: 20,
    fontWeight: '600',
    color: '#eceff4',
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusLabel: {
    fontFamily: ui,
    fontSize: 14,
    lineHeight: 20,
    color: '#9ca3af',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 8,
  },
  statusDotAdvertising: {
    backgroundColor: '#6b9b7a',
  },
  statusDotPoweredOn: {
    backgroundColor: '#a89a6e',
  },
  statusDotError: {
    backgroundColor: '#a67a72',
  },
  controlsContainer: {
    // flex: 1,
    maxHeight: '60%',
  },
  controlsContent: {
    padding: 16,
    paddingBottom: 20,
  },
  sectionTitle: {
    fontFamily: ui,
    fontSize: 14,
    fontWeight: '600',
    color: '#a8b0bd',
    marginBottom: 8,
    letterSpacing: 0.2,
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  button: {
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 8,
    minWidth: 80,
    borderWidth: 1,
    backgroundColor: '#1e2129',
  },
  buttonText: {
    fontFamily: ui,
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  inputRowName: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  inputNameField: {
    flex: 1,
    fontFamily: ui,
    backgroundColor: '#1a1d24',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginLeft: 4,
    color: '#e4e7ec',
    fontSize: 15,
    lineHeight: 22,
    borderWidth: 1,
    borderColor: '#2d323c',
  },
  input: {
    flex: 1,
    fontFamily: ui,
    backgroundColor: '#1a1d24',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#e4e7ec',
    fontSize: 15,
    lineHeight: 22,
    borderWidth: 1,
    borderColor: '#2d323c',
  },
  logsContainer: {
    ...elevated,
    flex: 1,
    backgroundColor: '#0e0f12',
    ...embossed,
    borderTopWidth: 1,
    borderTopColor: '#3a4254',
    zIndex: 1,
  },
  logsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2a2f3a',
  },
  logsTitle: {
    fontFamily: ui,
    fontSize: 13,
    fontWeight: '600',
    color: '#8b949e',
    letterSpacing: 0.3,
  },
  clearButton: {
    fontFamily: ui,
    fontSize: 14,
    fontWeight: '500',
    color: '#9ab6d4',
  },
  logsList: {
    flex: 1,
  },
  logsListContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  logItem: {
    flexDirection: 'row',
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1e2129',
  },
  logType: {
    fontSize: 11,
    fontFamily: mono,
    marginRight: 8,
  },
  logMessage: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: '#b0b8c4',
    fontFamily: mono,
  },
  serviceButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#1a1d24',
    borderWidth: 1,
    borderColor: '#2d323c',
    gap: 6,
  },
  serviceButtonSelected: {
    borderColor: '#4a6b7a',
    backgroundColor: '#1a2228',
  },
  serviceButtonStop: {
    borderColor: '#5a4548',
    backgroundColor: '#1f1a1c',
    flex: 0.6,
  },
  serviceButtonText: {
    fontFamily: ui,
    color: '#9ca3af',
    fontSize: 14,
    fontWeight: '500',
  },
  serviceButtonTextSelected: {
    color: '#c5d4e0',
  },
  serviceButtonStopLabel: {
    fontFamily: ui,
    color: '#c4a8a8',
    fontSize: 14,
    fontWeight: '500',
  },
  serviceControlsContainer: {
    ...elevated,
    backgroundColor: '#16181f',
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
    marginBottom: 4,
    ...embossed,
  },
  serviceHint: {
    fontFamily: ui,
    fontSize: 12,
    lineHeight: 17,
    color: '#6b7280',
    marginTop: 8,
    textAlign: 'center',
  },
  heartRateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  heartRateButton: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#1a1d24',
    borderWidth: 1,
    borderColor: '#353b4a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heartRateButtonText: {
    fontFamily: ui,
    color: '#d1d5db',
    fontSize: 13,
    fontWeight: '600',
  },
  heartRateValueContainer: {
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  heartRateValue: {
    fontFamily: ui,
    fontSize: 44,
    fontWeight: '600',
    color: '#e4e7ec',
    fontVariant: ['tabular-nums'],
  },
  heartRateUnit: {
    fontFamily: ui,
    fontSize: 13,
    fontWeight: '500',
    color: '#9ca3af',
    marginTop: -2,
  },
  lbsControlsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    gap: 12,
  },
  lbsControlItem: {
    ...elevatedSoft,
    flex: 1,
    backgroundColor: '#1a1d24',
    borderRadius: 10,
    padding: 12,
    ...embossedInset,
  },
  lbsControlLabel: {
    fontFamily: ui,
    fontSize: 12,
    fontWeight: '500',
    color: '#8b949e',
    marginBottom: 8,
  },
  lbsSwitchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  lbsSwitchLabel: {
    fontFamily: ui,
    fontSize: 14,
    fontWeight: '500',
    color: '#d1d5db',
  },
  lbsLedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  lbsLedBulb: {
    fontSize: 26,
    opacity: 0.35,
  },
  lbsLedBulbOn: {
    opacity: 1,
    textShadowColor: '#a89a6e',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  lbsLedStatus: {
    fontFamily: ui,
    fontSize: 14,
    fontWeight: '500',
    color: '#9ca3af',
  },
  lbsLedStatusOn: {
    color: '#c5b896',
  },
  batteryContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#2a2f3a',
  },
  batterySliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  batteryButton: {
    width: 40,
    height: 32,
    borderRadius: 6,
    backgroundColor: '#1a1d24',
    borderWidth: 1,
    borderColor: '#3d4a5c',
    alignItems: 'center',
    justifyContent: 'center',
  },
  batteryButtonText: {
    fontFamily: ui,
    color: '#d1d5db',
    fontSize: 12,
    fontWeight: '600',
  },
  batteryValueContainer: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  batteryBarBackground: {
    width: '100%',
    height: 20,
    backgroundColor: '#1a1d24',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#2d323c',
    overflow: 'hidden',
  },
  batteryBarFill: {
    height: '100%',
    backgroundColor: '#5a7a6a',
    borderRadius: 5,
  },
  batteryValue: {
    fontFamily: ui,
    fontSize: 14,
    fontWeight: '600',
    color: '#a8b5a8',
    marginTop: 4,
  },
});
