import AsyncStorage from '@react-native-async-storage/async-storage';
import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';

// URL base
const BASE_URL = 'https://biometria.lavianda.com.co/V1/';

// Configuración de headers
const getConfig = async (): Promise<AxiosRequestConfig> => {
  try {
    const authToken = await AsyncStorage.getItem('authToken');
    return {
      headers: {
        
        'Content-Type': 'application/json',
      },
    };
  } catch (error) {
    console.error('Error retrieving authToken:', error);
    return {
      headers: { 'Content-Type': 'application/json' },
    };
  }
};

// =====================================
// Funciones HTTP
// =====================================

interface LoginParams {
  cedula: string;
  
}

// LOGIN
export const loginHttps = async ({cedula}:LoginParams) => {

  try {
    return await axios.post(BASE_URL + 'contacts/login', {
      cedula,
    });
  } catch (error) {
    throw error;
  }
};

// POST JSON
export const postHttps = async <T = any>(url: string, body: any): Promise<AxiosResponse<T>> => {
  try {
    const authToken = await AsyncStorage.getItem('authToken');
    return await axios.post<T>(`${BASE_URL}${url}`, body, {
      headers: {
        Authorization: authToken ? `Bearer ${authToken}` : undefined,
        'Content-Type': 'application/json',
      },
    });
  } catch (error: any) {
    if (error.response) throw error.response.data;
    throw error;
  }
};



// POST registro (sin auth, multipart/form-data)
export const putRegister = async <T = any>(url: string, body: FormData): Promise<AxiosResponse<T>> => {
  
  try {
    return await axios.put<T>(`${BASE_URL}${url}`, body, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  } catch (error: any) {
    if (error.response) throw error.response.data;
    throw error;
  }
};

export const postRegister = async <T = any>(url: string, body: FormData): Promise<AxiosResponse<T>> => {
  try {
    return await axios.post<T>(`${BASE_URL}${url}`, body, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  } catch (error: any) {
    if (error.response) throw error.response.data;
    throw error;
  }
};

// PATCH JSON
export const patchHttps = async <T = any>(url: string, body: any): Promise<AxiosResponse<T>> => {
  try {
    const authToken = await AsyncStorage.getItem('authToken');
    return await axios.patch<T>(`${BASE_URL}${url}`, body, {
      headers: {
        Authorization: authToken ? `Bearer ${authToken}` : undefined,
        'Content-Type': 'application/json',
      },
    });
  } catch (error: any) {
    if (error.response) throw error.response.data;
    throw error;
  }
};

// PATCH multipart/form-data
export const patchHttpsStories = async <T = any>(url: string, body: FormData): Promise<AxiosResponse<T>> => {
  try {
    const authToken = await AsyncStorage.getItem('authToken');
    return await axios.patch<T>(`${BASE_URL}${url}`, body, {
      headers: {
        Authorization: authToken ? `Bearer ${authToken}` : undefined,
        'Content-Type': 'multipart/form-data',
      },
    });
  } catch (error: any) {
    if (error.response) throw error.response.data;
    throw error;
  }
};

// DELETE
export const deleteHttps = async <T = any>(url: string): Promise<AxiosResponse<T>> => {
  try {
    return await axios.delete<T>(`${BASE_URL}${url}`, await getConfig());
  } catch (error) {
    throw error;
  }
};

// GET
export const getHttps = async <T = any>(url: string, params?: any): Promise<AxiosResponse<T>> => {
  try {
  
    return await axios.get<T>(`${BASE_URL}${url}`, {
      headers: {
       
        'Content-Type': 'application/json',
      },
      params,
    });
  } catch (error: any) {
    if (error.response) throw error.response.data;
    throw error;
  }
};
