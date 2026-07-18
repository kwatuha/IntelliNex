import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import apiService from '../services/api';
import { API_BASE_URL, THEME, APP_VERSION } from '../config/api';

interface Props {
  onLoginSuccess?: () => void;
}

const LoginScreen: React.FC<Props> = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const errorMessage = (error: any) => {
    const data = error?.response?.data;
    const status = error?.response?.status;
    const serverMsg = data?.error || data?.message || data?.msg;
    if (serverMsg) return serverMsg;
    if (status === 401 || status === 400) return 'Invalid username or password.';
    if (error?.message?.includes('Network Error')) {
      return `Cannot reach ${API_BASE_URL}. Check Wi‑Fi/data and API URL in src/config/api.ts.`;
    }
    return error?.message || 'Request failed';
  };

  const handleLogin = async () => {
    if (!username.trim() || !password) {
      Alert.alert('Missing fields', 'Enter username and password.');
      return;
    }
    setLoading(true);
    try {
      await apiService.login(username.trim(), password);
      onLoginSuccess?.();
    } catch (error: any) {
      Alert.alert('Login failed', errorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.card}>
        <View style={styles.logoBand}>
          <Image
            source={require('../../assets/logo.png')}
            style={styles.logo}
            resizeMode="contain"
            accessibilityLabel="IntelliNex"
          />
        </View>
        <Text style={styles.brand}>IntelliNex Field</Text>
        <Text style={styles.subtitle}>Offline surveillance · chemist dispense · asset verify</Text>
        <TextInput
          style={styles.input}
          placeholder="Username"
          autoCapitalize="none"
          autoCorrect={false}
          value={username}
          onChangeText={setUsername}
          editable={!loading}
        />
        <View style={styles.passwordRow}>
          <TextInput
            style={[styles.input, styles.passwordInput]}
            placeholder="Password"
            secureTextEntry={!showPassword}
            value={password}
            onChangeText={setPassword}
            editable={!loading}
          />
          <TouchableOpacity onPress={() => setShowPassword((v) => !v)} style={styles.showBtn}>
            <Text style={styles.showBtnText}>{showPassword ? 'Hide' : 'Show'}</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Sign in</Text>
          )}
        </TouchableOpacity>
        <Text style={styles.meta}>v{APP_VERSION} · {API_BASE_URL}</Text>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.background,
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: THEME.card,
    borderRadius: 12,
    padding: 24,
    borderWidth: 1,
    borderColor: THEME.border,
    overflow: 'hidden',
  },
  logoBand: {
    backgroundColor: THEME.primaryDark,
    marginHorizontal: -24,
    marginTop: -24,
    marginBottom: 16,
    paddingVertical: 18,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  logo: {
    width: '100%',
    height: 92,
  },
  brand: {
    fontSize: 26,
    fontWeight: '700',
    color: THEME.primary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: THEME.textMuted,
    marginBottom: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 12,
    fontSize: 16,
    color: THEME.text,
    backgroundColor: '#fff',
  },
  passwordRow: { position: 'relative' },
  passwordInput: { paddingRight: 64 },
  showBtn: { position: 'absolute', right: 12, top: 14 },
  showBtnText: { color: THEME.accent, fontWeight: '600' },
  button: {
    backgroundColor: THEME.primary,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  meta: { marginTop: 16, fontSize: 11, color: THEME.textMuted, textAlign: 'center' },
});

export default LoginScreen;
