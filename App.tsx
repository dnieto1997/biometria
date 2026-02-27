import React, { useEffect, useRef } from 'react';
import { StatusBar, useColorScheme, Alert, Platform, PermissionsAndroid } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import RNFS from 'react-native-fs';
import AppNavigation from './navigation/AppNavigation';
import {
  saveContactsToCache,
  shouldSyncContacts,
} from './storage/contactsCache';
import { getHttps, postRegister } from './api/axios';
import { clearQueue, getQueue } from './storage/offlineQueue';

function App() {
  const syncingRef = useRef(false);
  const BASE_URL = 'https://biometria.lavianda.com.co/V1/';

  // Solicitar permiso de ubicación
  const requestLocationPermission = async (): Promise<boolean> => {
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        {
          title: 'Permiso de ubicación',
          message: 'La app necesita acceder a tu ubicación',
          buttonPositive: 'Aceptar',
          buttonNegative: 'Cancelar',
        }
      );
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        Alert.alert(
          'Permiso de ubicación requerido',
          'No se puede usar la ubicación sin permiso'
        );
        return false;
      }
      return true;
    }
    return true; // iOS maneja permisos automáticamente
  };

  useEffect(() => {
    requestLocationPermission();
  }, []);

  const cleanOldCache = async () => {
  const files = await RNFS.readDir(RNFS.CachesDirectoryPath);

  const oldFiles = files.filter(f =>
    f.name.startsWith('face-')
  );

  for (const f of oldFiles) {
    try {
      await RNFS.unlink(f.path);
    } catch {}
  }
};

useEffect(() => {
  cleanOldCache();
}, []);

  // Sincronizar la cola offline
  const syncOfflineQueue = async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;

    try {
      const state = await NetInfo.fetch();
      if (!state.isConnected) {
        console.log('❌ Sin internet');
        return;
      }

      const queue = await getQueue();
      if (!queue || queue.length === 0) {
        console.log('📦 Cola vacía');
        return;
      }

      // Ordenar por fecha y hora
      queue.sort((a: any, b: any) => {
        if (a.date === b.date) return a.time.localeCompare(b.time);
        return a.date.localeCompare(b.date);
      });

      console.log('📡 Sincronizando registros:', queue.length);

      const failedItems: any[] = [];

      for (const item of queue) {
        try {
          const formData = new FormData();
          formData.append('contact_id', String(item.contact_id));
          formData.append('photo', {
            uri: item.photoUri,
            name: 'face.jpg',
            type: 'image/jpeg',
          } as any);
          formData.append('latitude', String(item.latitude));
          formData.append('longitude', String(item.longitude));
          formData.append('date', item.date);
          formData.append('time', item.time);
          console.log(item)

           const response = await fetch(`${BASE_URL}contacts/verify-face-offline`, {
    method: 'POST',
    body: formData,
    // No necesitas poner headers Content-Type, fetch lo hace automáticamente
  });

  const data = await response.json();
  console.log('📤 Respuesta del servidor:', data);
    const cleanPath = item.photoUri.replace('file://', '');
    const exists = await RNFS.exists(cleanPath);

    if (exists) {
      await RNFS.unlink(cleanPath);
      console.log('🗑 Imagen eliminada:', cleanPath);
    }
          console.log('✅ Registro enviado:', item.contact_id, item.time);
        } catch (err) {
          console.log('❌ Error enviando item:', err);
          console.log('Item fallido:', err);
          failedItems.push(item);
        }
      }

      if (failedItems.length === 0) {
        await clearQueue();
        console.log('✅ Cola offline sincronizada completamente');
      } else {
        await AsyncStorage.setItem(
          'OFFLINE_FACE_QUEUE',
          JSON.stringify(failedItems)
        );
        console.log('⚠ Algunos registros fallaron y se reintentaran');
      }
    } catch (err) {
      console.warn('❌ Error general sincronizando cola', err);
    } finally {
      syncingRef.current = false;
    }
  };

  // Manejar sincronización al montar y al reconectarse
  useEffect(() => {
    const handleConnectivityChange = async (state: any) => {
      if (!state.isConnected) return;

      console.log('🌐 Internet disponible, sincronizando...');
      await syncOfflineQueue();

      try {
        const mustSync = await shouldSyncContacts();
        if (mustSync) {
          const res = await getHttps('contacts');
          if (Array.isArray(res.data)) {
            await saveContactsToCache(res.data);
            console.log('✅ Contactos sincronizados');
          }
        }
      } catch (err) {
        console.warn('❌ Error sincronizando contactos', err);
      }
    };

    // Escuchar cambios de conectividad
    const unsubscribe = NetInfo.addEventListener(handleConnectivityChange);

    // Ejecutar al montar si ya hay internet
    NetInfo.fetch().then(handleConnectivityChange);

    return () => unsubscribe();
  }, []);

  const isDarkMode = useColorScheme() === 'dark';

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <AppNavigation />
    </SafeAreaProvider>
  );
}

export default App;