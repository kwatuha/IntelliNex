import React, { useCallback, useContext, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import ScreenHeader from '../components/ScreenHeader';
import { AuthContext } from '../navigation/AppNavigator';
import { THEME } from '../config/api';
import {
  getCachedTemplates,
  getCacheTimestamp,
  getPendingAssetVerifications,
  getPendingChemistActions,
  getPendingSubmissions,
} from '../services/offlineStore';
import { refreshCatalog, syncAllPending } from '../services/syncService';
import apiService from '../services/api';
import { DataCollectionTemplate } from '../types/dataCollection';

function apiErrorMessage(error: any): string {
  const data = error?.response?.data;
  const status = error?.response?.status;
  const serverMsg = data?.message || data?.error || data?.msg;
  if (serverMsg) return serverMsg;
  if (status === 401) return 'Session expired. Sign in again.';
  if (error?.message?.includes('Network Error')) {
    return 'Cannot reach the server. Check mobile data or Wi‑Fi.';
  }
  return error?.message || 'Could not refresh from server.';
}

const TemplatesScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const auth = useContext(AuthContext);
  const [templates, setTemplates] = useState<DataCollectionTemplate[]>([]);
  const [cacheTime, setCacheTime] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadLocal = async (): Promise<number> => {
    const [cached, ts, pendingSubs, pendingChem, pendingAssets] = await Promise.all([
      getCachedTemplates(),
      getCacheTimestamp(),
      getPendingSubmissions(),
      getPendingChemistActions(),
      getPendingAssetVerifications(),
    ]);
    setTemplates(cached);
    setCacheTime(ts);
    setPendingCount(pendingSubs.length + pendingChem.length + pendingAssets.length);
    return cached.length;
  };

  const refreshAll = async (opts: { silent?: boolean } = {}) => {
    let catalogError: unknown = null;
    try {
      await refreshCatalog();
    } catch (error) {
      catalogError = error;
    }
    const cachedCount = await loadLocal();
    const sync = await syncAllPending();
    const uploaded =
      sync.submissions.synced + sync.chemist.synced + sync.assets.synced;
    if (uploaded > 0) {
      Alert.alert('Synced', `${uploaded} pending item(s) uploaded.`);
    } else if (sync.errors.length && !opts.silent) {
      Alert.alert('Sync issues', sync.errors.slice(0, 3).join('\n'));
    }
    if (catalogError && (!opts.silent || cachedCount === 0)) {
      Alert.alert(
        cachedCount > 0 ? 'Sync issue' : 'Offline mode',
        `${apiErrorMessage(catalogError)}\n\n${
          cachedCount > 0
            ? 'Showing cached checklists.'
            : 'No checklists cached yet. Pull down to retry.'
        }`
      );
    }
    await loadLocal();
    apiService.promptForAppUpdateIfNeeded().catch(() => {});
    apiService.reportAppUsage('app_sync').catch(() => {});
  };

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadLocal()
        .then(() => refreshAll({ silent: true }))
        .finally(() => setLoading(false));
    }, [])
  );

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Checklists"
        subtitle={
          pendingCount
            ? `${pendingCount} pending offline · ${cacheTime ? `synced ${cacheTime.slice(0, 16)}` : 'never synced'}`
            : cacheTime
              ? `Last sync ${cacheTime.slice(0, 16)}`
              : 'Pull to sync templates'
        }
        onLogout={() => auth?.logout()}
        rightAction={{
          label: 'Sync',
          onPress: () => {
            setRefreshing(true);
            void refreshAll().finally(() => setRefreshing(false));
          },
        }}
      />
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={THEME.primary} />
      ) : (
        <FlatList
          data={templates}
          keyExtractor={(item) => String(item.templateId)}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void refreshAll().finally(() => setRefreshing(false));
              }}
              colors={[THEME.primary]}
            />
          }
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>
              No templates. Create datasets in HMIS → Field datasets, then Sync.
            </Text>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() =>
                navigation.navigate('NewVisit', {
                  templateId: item.templateId,
                  templateName: item.name,
                })
              }
            >
              <Text style={styles.cardTitle}>{item.name}</Text>
              {item.description ? (
                <Text style={styles.cardDesc} numberOfLines={2}>
                  {item.description}
                </Text>
              ) : null}
              <Text style={styles.cardMeta}>{item.templateCategory || 'dataset'}</Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.background },
  list: { padding: 16, paddingBottom: 40 },
  empty: { textAlign: 'center', color: THEME.textMuted, marginTop: 40, paddingHorizontal: 24 },
  card: {
    backgroundColor: THEME.card,
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: THEME.text },
  cardDesc: { marginTop: 4, fontSize: 13, color: THEME.textMuted },
  cardMeta: { marginTop: 8, fontSize: 11, color: THEME.accent, fontWeight: '600' },
});

export default TemplatesScreen;
