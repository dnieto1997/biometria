import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Camera, useCameraDevice } from 'react-native-vision-camera';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useRoute,useNavigation } from '@react-navigation/native';
import { putRegister } from '../api/axios';


type RouteParams = {
  FacialRegister: { contact_id: number };
};

export default function FacialRegister() {
  const route = useRoute<RouteProp<RouteParams, 'FacialRegister'>>();
  const { contact_id } = route.params;
  const navigation = useNavigation<any>();

  const cameraRef = useRef<Camera>(null);
  const device = useCameraDevice('front');

  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  // 📌 Permisos
  useEffect(() => {
    (async () => {
      const status = await Camera.getCameraPermissionStatus();

      if (status !== 'granted') {
        const newStatus = await Camera.requestCameraPermission();
        setHasPermission(newStatus === 'granted');
      } else {
        setHasPermission(true);
      }
    })();
  }, []);

  // 📌 Función principal
  const takePhotoAndRegister = async () => {
    if (loading) return;

    if (!cameraReady) {
      Alert.alert('Espera', 'La cámara aún no está lista');
      return;
    }

    if (!cameraRef.current) {
      Alert.alert('Error', 'Cámara no disponible');
      return;
    }

    try {
      // Cuenta regresiva
      for (let i = 3; i > 0; i--) {
        setCountdown(i);
        await new Promise((res:any) => setTimeout(res, 1000));
      }

      setCountdown(null);
      setLoading(true);

      const photo = await cameraRef.current.takePhoto({
        flash: 'off',
      });

      if (!photo?.path) {
        throw new Error('No se pudo capturar la imagen');
      }

      const formData = new FormData();
      formData.append('contact_id', String(contact_id));
      formData.append('photo', {
        uri: 'file://' + photo.path,
        name: 'face.jpg',
        type: 'image/jpeg',
      } as any);

      const response = await putRegister('contacts/register', formData);

      if (!response?.data?.success) {
        throw new Error(response?.data?.message || 'Error registrando rostro');
      }

  Alert.alert('✅ Éxito', 'Rostro registrado correctamente');

setTimeout(() => {
  navigation.replace('Login');
}, 1000);
    } catch (error: any) {
      console.log('ERROR FOTO:', error);
      Alert.alert('❌ Error', error?.message || 'Error al tomar la foto');
    } finally {
      setLoading(false);
    }
  };

  // 📌 Estados previos
  if (hasPermission === null) {
    return <View style={styles.center} />;
  }

  if (!hasPermission) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.error}>Permiso de cámara requerido</Text>
      </SafeAreaView>
    );
  }

  if (!device) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text>Cargando cámara...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Cámara */}
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={true}
        photo={true}
        onInitialized={() => setCameraReady(true)}
      />

      {/* Overlay (NO bloquea toques) */}
      <View style={styles.overlay} pointerEvents="none">
        <View style={styles.faceOval} />
        <Text style={styles.guideText}>
          Acomoda tu rostro dentro del óvalo
        </Text>
        {countdown && <Text style={styles.countdown}>{countdown}</Text>}
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.button, loading && styles.disabled]}
          onPress={takePhotoAndRegister}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? 'Procesando...' : 'Registrar rostro'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Loader */}
      {loading && (
        <View style={styles.loaderOverlay}>
          <ActivityIndicator size="large" color="#22c55e" />
          <Text style={styles.loaderText}>Procesando...</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  faceOval: {
    width: 240,
    height: 320,
    borderRadius: 160,
    borderWidth: 3,
    borderColor: '#22c55e',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  guideText: {
    marginTop: 20,
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
  },
  countdown: {
    position: 'absolute',
    fontSize: 72,
    color: '#22c55e',
    fontWeight: 'bold',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    padding: 20,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  button: {
    backgroundColor: '#2563eb',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  disabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  loaderOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loaderText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 12,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  error: {
    fontSize: 16,
    color: '#ef4444',
  },
});