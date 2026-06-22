'use strict';
import React, { useEffect, useRef, useState, useMemo } from 'react';

import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
  PermissionsAndroid,
  TouchableOpacity,
  AppState,
} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';
import RNBlobUtil from 'react-native-blob-util';
import RNFS from 'react-native-fs';

import {
  promptForEnableLocationIfNeeded,
  isLocationEnabled,
} from 'react-native-android-location-enabler';

import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useCameraFormat,
  useFrameProcessor,
} from 'react-native-vision-camera';

import {
  useFaceDetector,
  FrameFaceDetectionOptions,
} from 'react-native-vision-camera-face-detector';

import { Worklets } from 'react-native-worklets-core';

import NetInfo from '@react-native-community/netinfo';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import { addToQueue } from '../storage/offlineQueue';
import Geolocation from '@react-native-community/geolocation';

// ---------------- TYPES ----------------
type RouteParams = {
  FacialVerify: {
    contact_id: number;
  };
};

type SimpleFace = {
  yawAngle: number;
  smilingProbability: number;
  leftEyeOpenProbability: number;
  rightEyeOpenProbability: number;
  faceWidth?: number;
  faceHeight?: number;
  x?: number;
  y?: number;
  frameWidth?: number;
  frameHeight?: number;
};

export default function FacialVerify() {
  const route = useRoute<RouteProp<RouteParams, 'FacialVerify'>>();
  const navigation = useNavigation<any>();

  const { contact_id } = route.params;

  const [faceMessage, safeSetMessage] = useState('Detectando rostro...');

  const device = useCameraDevice('front');
  const { hasPermission, requestPermission } = useCameraPermission();

  const format = useCameraFormat(device ?? undefined, [
    {
      photoResolution: {
        width: 1280,
        height: 720,
      },
    },
  ]);

  const cameraRef = useRef<Camera>(null);

  const BASE_URL = 'https://biometria.lavianda.com.co/V1/';

  const [ready, setReady] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);

  // =========================
  // REFS
  // =========================
  const capturingRef = useRef(false);
  const validatedRef = useRef(false);

  const movementFramesRef = useRef(0);
  const stableMovementRef = useRef(0);

  const lastYawRef = useRef<number | null>(null);
  const movementScoreRef = useRef(0);

  const flatScoreRef = useRef(0);
  const lastFaceSizeRef = useRef<number | null>(null);

  // =========================
  // FACE DETECTOR
  // =========================
  const faceDetectionOptions: FrameFaceDetectionOptions = {
    performanceMode: 'accurate',
    classificationMode: 'all',
    landmarkMode: 'all',
    trackingEnabled: false,
  };

  const { detectFaces } = useFaceDetector(faceDetectionOptions);

  // =========================
  // LOCATION
  // =========================
  const [location, setLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

  // =========================
  // PERMISO UBICACIÓN
  // =========================
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

    return true;
  };

  // =========================
  // GPS
  // =========================
  const getFastLocation = (): Promise<{
    latitude: number;
    longitude: number;
  }> => {
    return new Promise((resolve, reject) => {
      let resolved = false;
      let watchId: number;

      let lastValid: {
        latitude: number;
        longitude: number;
      } | null = null;

      const isValid = (lat: number, lng: number) =>
        lat !== 0 &&
        lng !== 0 &&
        Math.abs(lat) > 0.0001 &&
        Math.abs(lng) > 0.0001;

      const finish = (
        data?: {
          latitude: number;
          longitude: number;
        },
      ) => {
        if (resolved) return;

        resolved = true;

        Geolocation.clearWatch(watchId);

        if (data) {
          setLocation(data);
          resolve(data);
        } else {
          reject(new Error('No se pudo obtener GPS válido'));
        }
      };

      Geolocation.getCurrentPosition(
        ({ coords }) => {
          if (isValid(coords.latitude, coords.longitude)) {
            lastValid = {
              latitude: coords.latitude,
              longitude: coords.longitude,
            };

            finish(lastValid);
          }
        },
        () => {},
        {
          enableHighAccuracy: false,
          timeout: 3000,
          maximumAge: 10000,
        },
      );

      watchId = Geolocation.watchPosition(
        ({ coords }) => {
          if (isValid(coords.latitude, coords.longitude)) {
            lastValid = {
              latitude: coords.latitude,
              longitude: coords.longitude,
            };

            finish(lastValid);
          }
        },
        () => {},
        {
          enableHighAccuracy: true,
          distanceFilter: 0,
          interval: 1000,
          fastestInterval: 500,
        },
      );

      setTimeout(() => {
        if (lastValid) finish(lastValid);
        else finish();
      }, 10000);
    });
  };

  // =========================
  // INIT
  // =========================
  useEffect(() => {
    const init = async () => {
      try {
        let cam = hasPermission;

        if (!cam) {
          cam = await requestPermission();
        }

        if (!cam) {
          Alert.alert('Permiso de cámara requerido');
          setReady(true);
          return;
        }

        const loc = await requestLocationPermission();

        if (!loc) {
          Alert.alert('Permiso ubicación denegado');
          setReady(true);
          return;
        }

        if (Platform.OS === 'android') {
          let enabled = await isLocationEnabled();

          if (!enabled) {
            try {
              await promptForEnableLocationIfNeeded();
            } catch {}
          }
        }

        try {
          await getFastLocation();
        } catch {}

        setReady(true);
      } catch (e) {
        console.log('INIT ERROR', e);
        setReady(true);
      }
    };

    init();
  }, []);

  // =========================
  // ANTI SPOOF
  // =========================
  const updateSpoofDetection = (face: SimpleFace) => {
    if (!face.faceWidth || !face.faceHeight) {
      return false;
    }

    const size = face.faceWidth * face.faceHeight;

    if (!lastFaceSizeRef.current) {
      lastFaceSizeRef.current = size;
      return false;
    }

    const diff = Math.abs(size - lastFaceSizeRef.current);

    lastFaceSizeRef.current = size;

    if (diff < 200) {
      flatScoreRef.current += 1;
    } else {
      flatScoreRef.current = Math.max(0, flatScoreRef.current - 1);
    }

    return flatScoreRef.current >= 25;
  };

const blinkFramesRef = useRef(0);
const blinkDetectedRef = useRef(false);

const processFace = (faces: SimpleFace[]) => {
  // =========================
  // SIN ROSTRO
  // =========================
  if (!faces.length) {
    setFaceDetected(false);

    movementFramesRef.current = 0;
    stableMovementRef.current = 0;
    movementScoreRef.current = 0;
    lastYawRef.current = null;
    flatScoreRef.current = 0;

    blinkFramesRef.current = 0;
    blinkDetectedRef.current = false;

    validatedRef.current = false;

    safeSetMessage('Busca tu rostro');
    return;
  }

  const face = faces[0];

  setFaceDetected(true);

  // =========================
  // ANTI SPOOF FOTO/PANTALLA
  // =========================
  const spoofDetected = updateSpoofDetection(face);

  if (spoofDetected) {
    safeSetMessage('Movimiento sospechoso detectado');
    return;
  }

  // =========================
  // DETECCIÓN DE PARPADEO REAL
  // =========================
  const leftEye = face.leftEyeOpenProbability ?? 1;
  const rightEye = face.rightEyeOpenProbability ?? 1;

  const eyesClosed =
    leftEye < 0.25 && rightEye < 0.25;

  if (eyesClosed) {
    blinkFramesRef.current += 1;
  } else {
    // Parpadeo válido
    if (
      blinkFramesRef.current >= 1 &&
      blinkFramesRef.current <= 6
    ) {
      blinkDetectedRef.current = true;
    }

    blinkFramesRef.current = 0;
  }

  // =========================
  // MOVIMIENTO NATURAL
  // =========================
  const currentYaw = face.yawAngle || 0;

  if (lastYawRef.current === null) {
    lastYawRef.current = currentYaw;

    safeSetMessage('Muévete naturalmente');
    return;
  }

  const yawDiff = Math.abs(
    currentYaw - lastYawRef.current,
  );

  lastYawRef.current = currentYaw;

  // Movimiento humano válido
  if (yawDiff > 1 && yawDiff < 12) {
    movementFramesRef.current += 1;
    movementScoreRef.current += 1;
  } else {
    movementScoreRef.current = Math.max(
      0,
      movementScoreRef.current - 0.05,
    );
  }

  // =========================
  // VALIDAR MOVIMIENTO
  // =========================
  if (movementFramesRef.current < 8) {
    safeSetMessage('Muévete naturalmente');
    return;
  }

  // =========================
  // VALIDAR PARPADEO
  // =========================
  if (!blinkDetectedRef.current) {
    safeSetMessage('Verificando identidad...');
    return;
  }

  // =========================
  // ESTABILIDAD FINAL
  // =========================
  stableMovementRef.current += 1;

  if (stableMovementRef.current < 10) {
    safeSetMessage('Perfecto, mantente así');
    return;
  }

  // =========================
  // CAPTURA
  // =========================
  if (
    !validatedRef.current &&
    !capturingRef.current
  ) {
    validatedRef.current = true;
    capturingRef.current = true;

    safeSetMessage('Capturando foto...');

    setTimeout(() => {
      takeFinalPhoto();
    }, 800);
  }
};

  // =========================
  // FRAME PROCESSOR
  // =========================
  const runOnJSFaces = useMemo(
    () => Worklets.createRunOnJS(processFace),
    [],
  );

  const frameProcessor = useFrameProcessor(frame => {
    'worklet';

    const faces = detectFaces(frame);

    const simplified = faces.map(f => ({
      yawAngle: f.yawAngle ?? 0,
      smilingProbability: f.smilingProbability ?? 0,
      leftEyeOpenProbability: f.leftEyeOpenProbability ?? 0,
      rightEyeOpenProbability: f.rightEyeOpenProbability ?? 0,
      faceWidth: f.bounds?.width ?? 0,
      faceHeight: f.bounds?.height ?? 0,
      x: f.bounds?.x ?? 0,
      y: f.bounds?.y ?? 0,
      frameWidth: frame.width,
      frameHeight: frame.height,
    }));

    runOnJSFaces(simplified);
  }, []);

  // =========================
  // GPS FORZADO
  // =========================
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let appState = AppState.currentState;
    let showingPopup = false;

    const forceEnableGPS = async () => {
      if (Platform.OS !== 'android') return;

      const enabled = await isLocationEnabled();

      if (!enabled && !showingPopup) {
        showingPopup = true;

        try {
          await promptForEnableLocationIfNeeded();
        } catch (error) {
          console.log('Usuario canceló GPS');
        }

        showingPopup = false;
      }
    };

    intervalId = setInterval(() => {
      forceEnableGPS();
    }, 2000);

    const subscription = AppState.addEventListener(
      'change',
      nextState => {
        if (
          appState.match(/inactive|background/) &&
          nextState === 'active'
        ) {
          forceEnableGPS();
        }

        appState = nextState;
      },
    );

    forceEnableGPS();

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }

      subscription.remove();
    };
  }, []);

  // =========================
  // FECHA
  // =========================
  const getFormattedDateTime = () => {
    const now = new Date();

    const pad = (n: number) => n.toString().padStart(2, '0');

    const date = `${now.getFullYear()}-${pad(
      now.getMonth() + 1,
    )}-${pad(now.getDate())}`;

    const time = `${pad(now.getHours())}:${pad(
      now.getMinutes(),
    )}:${pad(now.getSeconds())}`;

    return { date, time };
  };

  // =========================
  // FOTO FINAL
  // =========================
  const takeFinalPhoto = async (existingPhotoPath?: string) => {
    if (processing) return;

    setProcessing(true);

    try {
      const photo = existingPhotoPath
        ? {
            path: existingPhotoPath.replace('file://', ''),
          }
        : await cameraRef.current!.takePhoto({
            flash: 'off',
          });

      if (!photo?.path) {
        throw new Error('No se pudo capturar la imagen');
      }

      const cleanPath = photo.path.replace('file://', '');

      const exists = await RNFS.exists(cleanPath);

      if (!exists) {
        throw new Error('El archivo no existe');
      }

      const fileUri = `file://${cleanPath}`;

      const { latitude, longitude } = await getFastLocation();

      const netState = await NetInfo.fetch();

      // =========================
      // OFFLINE
      // =========================
      if (
        !netState.isConnected ||
        !netState.isInternetReachable
      ) {
        const fileName = `face-${Date.now()}.jpg`;

        const blobPath = `${RNBlobUtil.fs.dirs.DocumentDir}/${fileName}`;

        await RNBlobUtil.fs.cp(cleanPath, blobPath);

        const offlinePhotoUri = `file://${blobPath}`;

        const { date, time } = getFormattedDateTime();

        await addToQueue({
          contact_id,
          photoUri: offlinePhotoUri,
          latitude,
          longitude,
          date,
          time,
        });

        Alert.alert(
          'Verificación guardada',
          'Se enviará automáticamente cuando recuperes conexión',
        );

        navigation.replace('Login' as never);

        return;
      }

      // =========================
      // SUBIR FOTO
      // =========================
      const formData = new FormData();

      formData.append('contact_id', String(contact_id));
      formData.append('latitude', String(latitude));
      formData.append('longitude', String(longitude));

      formData.append(
        'photo',
        {
          uri: fileUri,
          name: 'face.jpg',
          type: 'image/jpeg',
        } as any,
      );

      const res = await fetch(
        `${BASE_URL}contacts/verify`,
        {
          method: 'PUT',
          body: formData,
        },
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Error subiendo foto');
      }

      if (!existingPhotoPath && (await RNFS.exists(cleanPath))) {
        await RNFS.unlink(cleanPath);
      }

      Alert.alert(
        'Verificación exitosa',
        'Tu identidad fue validada',
      );

      navigation.replace('Login' as never);
    } catch (err) {
      console.log('ERROR FINALIZANDO VERIFICACIÓN', err);

      Alert.alert(
        'Inténtalo nuevamente',
        'No se pudo procesar la foto',
      );

      navigation.replace('Login' as never);
    } finally {
      setProcessing(false);
    }
  };

  // =========================
  // LOADING
  // =========================
  if (!device || !ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#22c55e" />

        <Text style={styles.text}>Cargando...</Text>
      </View>
    );
  }

  // =========================
  // UI
  // =========================
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.faceGuideContainer}>
        <View style={styles.faceOval} />
      </View>

      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive
        photo
        format={format}
        frameProcessor={frameProcessor}
      />

      <View style={styles.overlay}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>Atrás</Text>
        </TouchableOpacity>

        <Text style={styles.challenge}>{faceMessage}</Text>
      </View>

      {processing && (
        <View style={styles.loaderOverlay}>
          <ActivityIndicator size="large" color="#22c55e" />
        </View>
      )}
    </SafeAreaView>
  );
}

// =========================
// STYLES
// =========================
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },

  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },

  text: {
    color: '#fff',
    marginTop: 10,
  },

  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 120,
  },

  challenge: {
  fontSize: 28,
  color: 'white',
  fontWeight: 'bold',
  backgroundColor: '#C62828',
  paddingHorizontal: 16,
  paddingVertical: 10,
  borderRadius: 12,
  overflow: 'hidden',
  textAlign: 'center',
},

  faceGuideContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },

  faceOval: {
    width: 220,
    height: 300,
    borderRadius: 160,
    borderWidth: 3,
    borderColor: '#22c55e',
    backgroundColor: 'transparent',
  },

  backButton: {
    position: 'absolute',
    top: 50,
    left: 20,
    backgroundColor: '#0008',
    padding: 10,
    borderRadius: 8,
  },

  backButtonText: {
    color: '#fff',
  },

  loaderOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0006',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

