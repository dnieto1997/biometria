// --- screens/LoginScreen.tsx ---
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Image,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useNavigation } from "@react-navigation/native";
import { loginHttps } from "../api/axios";
import { getContactsFromCache } from "../storage/contactsCache";

type RootStackParamList = {
  FacialRegister: { contact_id: string };
  FacialVerify: { contact_id: string };
  Main: undefined;
};

type LoginScreenNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  "FacialRegister"
>;

const COLORS = {
  primary: "#C62828",
  background: "#F5F6FA",
  text: "#212121",
  placeholder: "#9E9E9E",
  border: "#E0E0E0",
};

export default function LoginScreen() {
  const navigation = useNavigation<LoginScreenNavigationProp>();
  const [cedula, setCedula] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!cedula.trim()) {
      Alert.alert("Error", "Por favor ingresa tu numero de identificación");
      return;
    }

    setLoading(true);

    try {
      const netState = await NetInfo.fetch();

      if (netState.isConnected) {
        try {
          const response = await loginHttps({ cedula });

          if (response.data?.success && response.data?.requires_facial) {
            const contactId = String(response.data.user.contact_id);

            navigation.navigate(
              response.data.facial_mode === "register"
                ? "FacialRegister"
                : "FacialVerify",
              { contact_id: contactId }
            );
            return;
          }

          Alert.alert("Error", "Usuario no autorizado");
          return;
        } catch (e) {
          console.log("⚠ API falló, usando modo offline...");
        }
      }

      const contacts = await getContactsFromCache();

      const foundUser = contacts.find(
        (contact: any) => String(contact.nit) === String(cedula)
      );

      if (!foundUser) {
        Alert.alert("Error", "La identificacion no está registrada");
        return;
      }

      const hasEmbedding =
        Array.isArray(foundUser.embedding) &&
        foundUser.embedding.length > 0;

      if (!hasEmbedding) {
        Alert.alert(
          "Sin conexión",
          "Debe conectarse a internet para registrar su rostro."
        );
        return;
      }

      navigation.navigate("FacialVerify", {
        contact_id: String(foundUser.contact_id),
      });
    } catch (error: any) {
      Alert.alert("Error", "No se pudo verificar la identificación. Intente nuevamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.card}>
        <Image
          source={require("../assets/logo.png")}
          style={styles.logo}
          resizeMode="contain"
        />

        <Text style={styles.title}>Control de Asistencia</Text>
        <Text style={styles.subtitle}>
          Ingrese su número de identificación para continuar
        </Text>

        <TextInput
          style={styles.input}
          placeholder="Número de identificación"
          placeholderTextColor={COLORS.placeholder}
          keyboardType="numeric"
          value={cedula}
          onChangeText={setCedula}
        />

        <TouchableOpacity
          style={styles.button}
          onPress={handleLogin}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>INGRESAR</Text>
          )}
        </TouchableOpacity>
      </View>

      <Text style={styles.footer}>© 2026 My Office</Text>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F6FA", // fondo general suave
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#C62828", // rojo corporativo
    borderRadius: 25,
    paddingVertical: 40,
    paddingHorizontal: 30,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
    alignItems: "center",
  },
  logo: {
    width: 130,
    height: 130,
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    textAlign: "center",
    color: "#fff", // blanco para resaltar sobre el rojo
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 14,
    textAlign: "center",
    color: "#ffe5e5", // rojo claro para suavizar
    marginBottom: 25,
  },
  input: {
    width: "100%",
    borderWidth: 1,
    borderColor: "#ff5252", // borde rojo claro
    borderRadius: 12,
    padding: 15,
    fontSize: 16,
    marginBottom: 20,
    color: "#212121",
    backgroundColor: "#fff5f5", // fondo muy claro para inputs
  },
  button: {
    backgroundColor: "#b71c1c", // rojo oscuro para botón
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    width: "100%",
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
    letterSpacing: 1,
  },
  footer: {
    marginTop: 25,
    fontSize: 12,
    color: "#9E9E9E",
    textAlign: "center",
  },
});