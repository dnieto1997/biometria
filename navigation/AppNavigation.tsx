// AppNavigation.js
import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Importa solo las pantallas necesarias
import Login from '../screens/Login';
import FacialRegister from '../screens/facial-register';
import FacialVerify from '../screens/facial-verify';

const Stack = createNativeStackNavigator();

const AppNavigation = () => {
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{ headerShown: false }}
        initialRouteName="Login"
      >
        <Stack.Screen name="Login" component={Login} />
        <Stack.Screen name="FacialRegister" component={FacialRegister} />
        <Stack.Screen name="FacialVerify" component={FacialVerify} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default AppNavigation;
