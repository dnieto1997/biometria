// FacialVerify.tsx (GPS y cámara sincronizados)
'use strict';
import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
  PermissionsAndroid,
  TouchableOpacity,
  Linking,
  
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import RNBlobUtil from 'react-native-blob-util';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useCameraFormat,
  useFrameProcessor,
} from 'react-native-vision-camera';

import {  useFaceDetector,FrameFaceDetectionOptions  } from 'react-native-vision-camera-face-detector';
import { Worklets } from 'react-native-worklets-core';

import NetInfo from '@react-native-community/netinfo';
import RNFS from 'react-native-fs';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import { addToQueue } from '../storage/offlineQueue';

import Geolocation from '@react-native-community/geolocation';



type RouteParams = { FacialVerify: { contact_id: number } };
const CHALLENGES = ['LEFT', 'RIGHT', 'SMILE', 'BLINK3'] as const;
type ChallengeType = (typeof CHALLENGES)[number];
type SimpleFace = {
  yawAngle: number;
  smilingProbability: number;
  leftEyeOpenProbability: number;
  rightEyeOpenProbability: number;
};

export default function FacialVerify() {
  const route = useRoute<RouteProp<RouteParams, 'FacialVerify'>>();
    const navigation = useNavigation<any>();
  const { contact_id } = route.params;
const [failedChallenge, setFailedChallenge] = useState<ChallengeType | null>(null);

  const device = useCameraDevice('front');
  const { hasPermission } = useCameraPermission();
  const format = useCameraFormat(device ?? undefined, [
    { photoResolution: { width: 1280, height: 720 } },
  ]);
  const [gpsEnabled, setGpsEnabled] = useState<boolean>(true);
  const cameraRef = useRef<Camera>(null);
  const BASE_URL = 'https://biometria.lavianda.com.co/V1/';

  const [location, setLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [gpsReadings, setGpsReadings] = useState<number[]>([]);
  const [ready, setReady] = useState(false); // listo = cámara + GPS
  const [faceDetected, setFaceDetected] = useState(false);
  const [blinkCount, setBlinkCount] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [completed, setCompleted] = useState<ChallengeType[]>([]);
  const [currentChallenge, setCurrentChallenge] =
    useState<ChallengeType | null>(null);

  const currentChallengeRef = useRef<ChallengeType | null>(null);
  const stableFramesRef = useRef(0);
  const blinkCountRef = useRef(0);
  const eyesClosedRef = useRef(false);

  const blinkThresholdClosed = 0.5;
  const blinkThresholdOpen = 0.7;
  const yawThreshold = 10;
  const stableFramesNeeded = 3;

  const faceDetectionOptions: FrameFaceDetectionOptions  = {
    performanceMode: 'accurate',
    classificationMode: 'all',
    landmarkMode: 'all',
    trackingEnabled: false,
  };
  const { detectFaces } = useFaceDetector(faceDetectionOptions);
const requestLocationPermission = async (): Promise<boolean> => {
  if (Platform.OS === 'android') {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      {
        title: 'Permiso de ubicación',
        message: 'La app necesita acceder a tu ubicación',
        buttonPositive: 'Aceptar',
        buttonNegative: 'Cancelar',
      },
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  }
  return true; // iOS maneja aparte
};



const getFastLocation = (): Promise<{ latitude: number; longitude: number }> => {
  return new Promise((resolve) => {
    let resolved = false;

    // 1️⃣ Intentar la última posición disponible (rápida)
    Geolocation.getCurrentPosition(
      (pos) => {
        if (!resolved) {
          resolved = true;
          console.log('GPS rápido:', pos.coords.latitude, pos.coords.longitude);
          resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        }
      },
      (err) => console.warn('getCurrentPosition error:', err),
      { enableHighAccuracy: false, timeout: 3000, maximumAge: 10000 }
    );

    // 2️⃣ Escuchar GPS real (alta precisión)
    const watchId = Geolocation.watchPosition(
      (pos) => {
        if (!resolved) {
          resolved = true;
          console.log('GPS real fijo:', pos.coords.latitude, pos.coords.longitude);
          resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        }
        // Actualizar constantemente mientras la pantalla está activa
        setLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      },
      (err) => console.warn('watchPosition error:', err),
      { enableHighAccuracy: true, distanceFilter: 0, interval: 1000, fastestInterval: 500 }
    );

    // 3️⃣ Timeout fallback 10s
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        console.warn('GPS timeout: ubicacion fallback 0,0');
        resolve({ latitude: 0, longitude: 0 });
      }
      Geolocation.clearWatch(watchId);
    }, 10000);
  });
};
useEffect(() => {
  let mounted = true;

  const initCameraAndLocation = async () => {
    try {
      // 1️⃣ Permiso cámara
      const camStatus = await Camera.requestCameraPermission();
      if (camStatus !== 'granted') {
        Alert.alert('Permiso de cámara requerido');
        return;
      }

      // 2️⃣ Permiso GPS
      const hasLocationPermission = await requestLocationPermission();
      if (!hasLocationPermission) {
        Alert.alert(
          'Permiso de ubicación',
          'La app necesita acceder al GPS para continuar',
          [
            {
              text: 'Abrir configuración',
              onPress: () => Linking.openSettings(),
            },
          ],
          { cancelable: false }
        );
        return;
      }

      // 3️⃣ Intentar obtener ubicación rápida
      const loc = await getFastLocation();

    
      if (!mounted) return;
      setLocation(loc);
      setReady(true);
    } catch (e) {
      console.warn('Error inicializando cámara/GPS:', e);
      if (!mounted) return;
      setLocation({ latitude: 0, longitude: 0 });
      setReady(true);
    }
  };

  initCameraAndLocation();

  return () => { mounted = false; };
}, []);


  // -------------------- Generar retos --------------------
  const generateChallenge = useCallback(() => {
    const remaining = CHALLENGES.filter(c => !completed.includes(c));
    if (remaining.length === 0) return;

    const newChallenge =
      remaining[Math.floor(Math.random() * remaining.length)];
    setCurrentChallenge(newChallenge);
    currentChallengeRef.current = newChallenge;

    stableFramesRef.current = 0;
    blinkCountRef.current = 0;
    eyesClosedRef.current = false;
    setBlinkCount(0);

    console.log('Nuevo reto generado:', newChallenge);
  }, [completed]);

  useEffect(() => {
    if (ready) generateChallenge();
  }, [ready]);

  // -------------------- Completar reto --------------------
  const completeChallenge = useCallback(() => {
    const challenge = currentChallengeRef.current;
    if (!challenge) return;

    currentChallengeRef.current = null; // bloquear reto actual

    setCompleted(prev => {
      if (prev.includes(challenge)) return prev;

      const updated = [...prev, challenge];

      // Reiniciar contadores
      stableFramesRef.current = 0;
      blinkCountRef.current = 0;
      eyesClosedRef.current = false;
      setBlinkCount(0);

      if (updated.length === CHALLENGES.length) {
        takeFinalPhoto(); // todos completados → foto final
      } else {
        // Generar el siguiente reto usando el array actualizado
        setTimeout(() => {
          generateChallengeWithCompleted(updated);
        }, 300);
      }

      return updated;
    });
  }, []);

  const generateChallengeWithCompleted = (completedArray: ChallengeType[]) => {
    const remaining = CHALLENGES.filter(c => !completedArray.includes(c));
    if (remaining.length === 0) return;

    const newChallenge =
      remaining[Math.floor(Math.random() * remaining.length)];
    setCurrentChallenge(newChallenge);
    currentChallengeRef.current = newChallenge;

    console.log('Nuevo reto generado:', newChallenge);
  };

  // -------------------- Procesamiento de caras --------------------
  const processFace = (faces: SimpleFace[]) => {
    const challenge = currentChallengeRef.current;
    if (!faces || faces.length === 0) {
      setFaceDetected(false);
      return;
    }

    setFaceDetected(true);
    const face = faces[0];
    if (!challenge) return;

    const left = face.leftEyeOpenProbability ?? 1;
    const right = face.rightEyeOpenProbability ?? 1;
    const eyesOpen = left > blinkThresholdOpen && right > blinkThresholdOpen;
    const eyesClosedNow =
      left < blinkThresholdClosed && right < blinkThresholdClosed;

    switch (challenge) {
      case 'LEFT':
        stableFramesRef.current =
          (face.yawAngle ?? 0) > yawThreshold
            ? stableFramesRef.current + 1
            : Math.max(0, stableFramesRef.current - 1);

        if (stableFramesRef.current >= stableFramesNeeded) {
          stableFramesRef.current = 0;
          completeChallenge();
        }
        break;

      case 'RIGHT':
        stableFramesRef.current =
          (face.yawAngle ?? 0) < -yawThreshold
            ? stableFramesRef.current + 1
            : Math.max(0, stableFramesRef.current - 1);

        if (stableFramesRef.current >= stableFramesNeeded) {
          stableFramesRef.current = 0;
          completeChallenge();
        }
        break;

      case 'SMILE':
        stableFramesRef.current =
          (face.smilingProbability ?? 0) > 0.5
            ? stableFramesRef.current + 1
            : Math.max(0, stableFramesRef.current - 1);

        if (stableFramesRef.current >= stableFramesNeeded) {
          stableFramesRef.current = 0;
          completeChallenge();
        }
        break;

      case 'BLINK3':
        if (eyesClosedNow && !eyesClosedRef.current)
          eyesClosedRef.current = true;

        if (eyesClosedRef.current && eyesOpen) {
          eyesClosedRef.current = false;
          blinkCountRef.current += 1;
          setBlinkCount(blinkCountRef.current);

          if (blinkCountRef.current >= 3) {
            blinkCountRef.current = 0;
            completeChallenge();
          }
        }
        break;
    }
  };

  const handleDetectedFaces = (faces: SimpleFace[])=> {
    processFace(faces);
  };

  // 2️⃣ crea runOnJS UNA sola vez
 const runOnJSFaces = useMemo(() => {
  return Worklets.createRunOnJS(handleDetectedFaces);
}, [handleDetectedFaces]);

const frameProcessor = useFrameProcessor(
  (frame) => {
    'worklet';
    if (!frame) return;

    const detectedFaces = detectFaces(frame);

    if (!detectedFaces || detectedFaces.length === 0) {
      runOnJSFaces([]);
      return;
    }

    const simplifiedFaces = detectedFaces.map(face => ({
      yawAngle: face.yawAngle ?? 0,
      smilingProbability: face.smilingProbability ?? 0,
      leftEyeOpenProbability: face.leftEyeOpenProbability ?? 0,
      rightEyeOpenProbability: face.rightEyeOpenProbability ?? 0,
    }));

    runOnJSFaces(simplifiedFaces);
  },
  [detectFaces, runOnJSFaces] // 👈 IMPORTANTE
);

useEffect(() => {
  let mounted = true;
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let checking = false; // evita solapamiento de llamadas

  const checkGPS = async () => {
    if (checking) return; // si ya está corriendo, saltar
    checking = true;

    try {
      const { latitude, longitude } = await getFastLocation();
      if (!mounted) return;

      const isValid = latitude !== 0 && longitude !== 0 ? 1 : 0;

      setGpsReadings(prev => {
        const newReadings = [...prev, isValid].slice(-3); // últimos 3 lecturas
        const allValid = newReadings.every(r => r === 1);

        setGpsEnabled(allValid); // true solo si las 3 últimas son válidas
        return newReadings;
      });

      setLocation({ latitude, longitude });
    } catch (err) {
      if (!mounted) return;
      setGpsEnabled(false);
    } finally {
      checking = false;
    }
  };

  // Revisar inmediatamente
  checkGPS();

  // Revisar cada 2 segundos
  intervalId = setInterval(checkGPS, 2000);

  return () => {
    mounted = false;
    if (intervalId) clearInterval(intervalId);
  };
}, []);

const savePhotoOffline = async (photoPath: string): Promise<string> => {
  // photoPath = ruta devuelta por la cámara, normalmente algo como:
  // /data/user/0/com.tuapp/cache/face-12345.jpg
  const fileName = `face-${Date.now()}.jpg`;
  const destPath = `${RNBlobUtil.fs.dirs.CacheDir}/${fileName}`;

  try {
    // Copia la foto al cache de la app
    await RNBlobUtil.fs.cp(photoPath, destPath);
    console.log('📁 Imagen guardada offline en:', destPath);
    return `file://${destPath}`; // Devuelve la ruta lista para usar
  } catch (err) {
    console.log('❌ Error guardando imagen offline', err);
    throw err;
  }
};

const takeFinalPhoto = async (existingPhotoPath?: string) => {
  if (processing) return;
  setProcessing(true);

  try {
    // 1️⃣ Tomar foto o usar existente
    const photo = existingPhotoPath
      ? { path: existingPhotoPath.replace('file://', '') }
      : await cameraRef.current!.takePhoto({ flash: 'off' });

    if (!photo?.path) throw new Error('No se pudo capturar la imagen');

    // 🔥 IMPORTANTE: limpiar doble file://
    const cleanPath = photo.path.replace('file://', '');

    const exists = await RNFS.exists(cleanPath);
    console.log('EXISTE FOTO?', exists, cleanPath);

    if (!exists) throw new Error('El archivo no existe');

    const fileUri = `file://${cleanPath}`;

    // 2️⃣ Ubicación
    const { latitude, longitude } = await getFastLocation();

    // 3️⃣ Verificar internet
    const netState = await NetInfo.fetch();
    if (!netState.isConnected || !netState.isInternetReachable) {
       const fileName = `face-${Date.now()}.jpg`;
      const blobPath = `${RNBlobUtil.fs.dirs.CacheDir}/${fileName}`;

      await RNBlobUtil.fs.cp(cleanPath, blobPath);
      console.log('💾 Foto guardada offline en:', blobPath);

      const offlinePhotoUri = `file://${blobPath}`;

      await addToQueue({
        contact_id,
        photoUri: offlinePhotoUri,
        latitude,
        longitude,
        date: new Date().toLocaleDateString(),
        time: new Date().toLocaleTimeString(),
      });

      Alert.alert('Guardado', 'Se sincronizará cuando tengas conexión');
      navigation.replace('Login' as never);
      return;
    }

    // 4️⃣ Enviar al servidor
    const formData = new FormData();
    formData.append('contact_id', String(contact_id));
    formData.append('latitude', String(latitude));
    formData.append('longitude', String(longitude));
    formData.append('photo', {
      uri: fileUri,
      name: 'face.jpg',
      type: 'image/jpeg',
    } as any);

    const res = await fetch(`${BASE_URL}contacts/verify`, {
      method: 'PUT',
      body: formData,
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Error subiendo foto');

    // 5️⃣ Borrar SOLO si fue tomada ahora
    if (!existingPhotoPath && await RNFS.exists(cleanPath)) {
      await RNFS.unlink(cleanPath);
    }

    Alert.alert('✅ Éxito', data.message);
    navigation.replace('Login' as never);

  } catch (err) {
    console.log('❌ Error:', err);
    Alert.alert('Error', 'No se pudo procesar la foto');
  } finally {
    setProcessing(false);
  }
};

  if (!device || !hasPermission || !ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#22c55e" />
        <Text style={styles.text}>Cargando</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive
        photo
        format={format}
        frameProcessor={frameProcessor}
      />
      {!gpsEnabled && (
  <View style={styles.gpsOverlay}>
    <Text style={styles.gpsText}>
      GPS desactivado. Actívalo para continuar.
    </Text>
    <TouchableOpacity
      onPress={() => {
        if (Platform.OS === 'android') Linking.openSettings();
        else Linking.openURL('App-Prefs:Privacy&path=LOCATION');
      }}
      style={styles.gpsButton}
    >
      <Text style={styles.gpsButtonText}>Abrir configuración</Text>
    </TouchableOpacity>
  </View>
)}
      <View style={styles.overlay}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            Alert.alert('Cancelar', '¿Deseas salir ?', [
              { text: 'No' },
              {
                text: 'Sí',
                onPress: () => navigation.goBack(), // regresa a la pantalla anterior
              },
            ]);
          }}
        >
          <Text style={styles.backButtonText}>Atrás</Text>
        </TouchableOpacity>
        <View style={styles.progressContainer}>
          {CHALLENGES.map(c => (
            <View
              key={c}
              style={[
                styles.progressDot,
                completed.includes(c)
                  ? { backgroundColor: '#22c55e' }
                  : { borderColor: '#fff', backgroundColor: 'transparent' },
              ]}
            />
          ))}
        </View>
        <Text style={styles.challenge}>
          {getChallengeText(currentChallenge, blinkCount)}
        </Text>
      </View>
      {processing && (
        <View style={styles.loaderOverlay}>
          <ActivityIndicator size="large" color="#22c55e" />
          <Text style={{ color: '#fff', marginTop: 10 }}>Cargando...</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

function getChallengeText(challenge: ChallengeType | null, blinkCount: number) {
  switch (challenge) {
    case 'LEFT':
      return 'Gira a la izquierda';
    case 'RIGHT':
      return 'Gira a la derecha';
    case 'SMILE':
      return 'Sonríe';
    case 'BLINK3':
      return `Parpadea 3 veces (${blinkCount}/3)`;
    default:
      return 'Preparando…';
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 120,
  },
  challenge: {
    marginTop: 10,
    fontSize: 20,
    color: '#fff',
    fontWeight: 'bold',
    textAlign: 'center',
    paddingHorizontal: 20,
    width: '90%',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  text: { color: '#fff',fontWeight:"bold",marginTop: 10 },
  progressContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
    gap: 10,
  },
  progressDot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2 },
  backButton: {
    position: 'absolute',
    top: 50,
    left: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 8,
    zIndex: 10,
    width: 80,
  },
  gpsOverlay: {
  ...StyleSheet.absoluteFillObject,
  justifyContent: 'center',
  alignItems: 'center',
  backgroundColor: 'rgba(0,0,0,0.8)',
  zIndex: 50,
},
gpsText: { color: 'white', fontSize: 18, textAlign: 'center', marginBottom: 20 },
gpsButton: { backgroundColor: '#22c55e', padding: 12, borderRadius: 8 },
gpsButtonText: { color: 'white', fontWeight: 'bold' },

  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  loaderOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
  },
});
