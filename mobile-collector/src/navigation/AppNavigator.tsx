import React, { useCallback, useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { ActivityIndicator, View } from 'react-native';

import apiService from '../services/api';
import LoginScreen from '../screens/LoginScreen';
import TemplatesScreen from '../screens/TemplatesScreen';
import SubmissionsScreen from '../screens/SubmissionsScreen';
import NewVisitScreen from '../screens/NewVisitScreen';
import ChemistReferralsScreen from '../screens/ChemistReferralsScreen';
import AssetVerifyScreen from '../screens/AssetVerifyScreen';
import MainTabBar from '../components/MainTabBar';
import { THEME } from '../config/api';
import { refreshCatalog } from '../services/syncService';

export const AuthContext = React.createContext<{ logout: () => Promise<void> } | null>(null);

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const MainTabs = () => (
  <Tab.Navigator
    tabBar={(props) => <MainTabBar {...props} />}
    screenOptions={{ headerShown: false }}
  >
    <Tab.Screen
      name="Checklists"
      component={TemplatesScreen}
      options={{ title: 'Checklists', tabBarLabel: 'Forms' }}
    />
    <Tab.Screen
      name="Chemist"
      component={ChemistReferralsScreen}
      options={{ title: 'Chemist', tabBarLabel: 'Chemist' }}
    />
    <Tab.Screen
      name="Assets"
      component={AssetVerifyScreen}
      options={{ title: 'Assets', tabBarLabel: 'Assets' }}
    />
    <Tab.Screen
      name="Submissions"
      component={SubmissionsScreen}
      options={{ title: 'Visits', tabBarLabel: 'Visits' }}
    />
  </Tab.Navigator>
);

const AppNavigator: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  const checkAuth = useCallback(async () => {
    try {
      const session = await apiService.resumeSession();
      setIsAuthenticated(session.authenticated);
    } catch {
      setIsAuthenticated(false);
    }
  }, []);

  useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

  const logout = useCallback(async () => {
    await apiService.logout();
    setIsAuthenticated(false);
  }, []);

  useEffect(() => {
    apiService.setUnauthorizedHandler(() => setIsAuthenticated(false));
    return () => apiService.setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    refreshCatalog().catch(() => {});
  }, [isAuthenticated]);

  if (isAuthenticated === null) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={THEME.primary} />
      </View>
    );
  }

  return (
    <AuthContext.Provider value={{ logout }}>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {!isAuthenticated ? (
            <Stack.Screen name="Login">
              {() => <LoginScreen onLoginSuccess={() => void checkAuth()} />}
            </Stack.Screen>
          ) : (
            <>
              <Stack.Screen name="MainTabs" component={MainTabs} />
              <Stack.Screen name="NewVisit" component={NewVisitScreen} />
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </AuthContext.Provider>
  );
};

export default AppNavigator;
