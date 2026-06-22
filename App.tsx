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
import axios from 'axios';

function App() {
  const syncingRef = useRef(false);
  const BASE_URL = 'https://biometria.lavianda.com.co/V1/';
  const isOnlineRef = useRef(false);

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
           const cleanPath1 = item.photoUri.replace('file://', '');
    const exists1 = await RNFS.exists(cleanPath1);

    console.log('📂 FOTO EXISTE?', exists1, cleanPath1);

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

       const  response = await axios.post(
  `${BASE_URL}contacts/verify-face-offline`,
  formData,
  {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    timeout: 15000,
  }
);

  console.log('📥 Respuesta servidor:', response.data);

  if (!response.data?.success) {
    throw new Error('El servidor no confirmó inserción');
  }
    const cleanPath = item.photoUri.replace('file://', '');
    const exists = await RNFS.exists(cleanPath);

    if (exists) {
      await RNFS.unlink(cleanPath);
      console.log('🗑 Imagen eliminada:', cleanPath);
    }
          console.log('✅ Registro enviado:', item.contact_id, item.time);
        } catch (err) {
          console.log("error", err)
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



useEffect(() => {
  const unsubscribe = NetInfo.addEventListener(async (state) => {
    const wasOnline = isOnlineRef.current;
    const nowOnline = !!state.isConnected;

    isOnlineRef.current = nowOnline;

    // SOLO cuando pasa de OFFLINE → ONLINE
    if (!wasOnline && nowOnline) {
      console.log("🌐 Internet restaurado");

      await startBackgroundSync();

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
    }
  });

  return () => unsubscribe();
}, []);

const startBackgroundSync = async () => {
  const queue = await getQueue();

  if (!queue || queue.length === 0) {
    console.log("📦 No hay nada que sincronizar");
    return;
  }

  console.log("🚀 Sincronizando en segundo plano");

  let attempts = 0;

  while (attempts < 5) {
    await syncOfflineQueue();

    const remaining = await getQueue();
    if (!remaining || remaining.length === 0) {
      console.log("✅ Sincronización completa");
      return;
    }

    attempts++;
    console.log(`🔁 Reintentando intento ${attempts}`);
    await new Promise((res:any) => setTimeout(res, 4000));
  }

  console.log("⚠ No se pudo completar sincronización");
};

  const isDarkMode = useColorScheme() === 'dark';

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <AppNavigation />
    </SafeAreaProvider>
  );
}

export default App;