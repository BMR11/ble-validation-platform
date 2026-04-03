/**
 * Pre-combined GATT characteristic property flags (native APIs use bitwise OR).
 */
/* eslint-disable no-bitwise -- GATT flags require bitwise combination */
import { CharacteristicProperties } from 'rn-ble-peripheral-module';

export const CHAR_READ_NOTIFY =
  CharacteristicProperties.Read | CharacteristicProperties.Notify;

export const CHAR_WRITE_AND_WRITE_WITHOUT_RESPONSE =
  CharacteristicProperties.Write |
  CharacteristicProperties.WriteWithoutResponse;
