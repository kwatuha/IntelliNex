import React, { useCallback, useContext, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import ScreenHeader from '../components/ScreenHeader';
import { AuthContext } from '../navigation/AppNavigator';
import { THEME } from '../config/api';
import apiService from '../services/api';
import {
  getCachedAssets,
  makeLocalId,
  savePendingAssetVerification,
  setCachedAssets,
} from '../services/offlineStore';
import { syncPendingAssetVerifications } from '../services/syncService';
import { extractApiError, shouldQueueOffline } from '../utils/apiErrorUtils';

const AssetVerifyScreen: React.FC = () => {
  const auth = useContext(AuthContext);
  const [assets, setAssets] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = async () => {
    const cached = await getCachedAssets();
    if (cached.length) setAssets(cached);
    try {
      const rows = await apiService.getCriticalAssets();
      setAssets(rows);
      await setCachedAssets(rows);
    } catch {
      // keep cache
    }
  };

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load().finally(() => setLoading(false));
    }, [])
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return assets;
    return assets.filter((a) => {
      const blob = [a.assetName, a.assetTag, a.location, a.departmentName]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return blob.includes(q);
    });
  }, [assets, query]);

  const verifyOne = async (asset: any, isPresent: boolean) => {
    const assetId = Number(asset.assetId);
    setBusyId(assetId);
    const user = await apiService.getStoredUser();
    try {
      if (!user?.id) throw new Error('Not signed in');
      await apiService.bulkVerifyAssets({
        verifiedBy: user.id,
        verifications: [
          {
            assetId,
            isPresent,
            notes: isPresent ? 'Verified present (Field app)' : 'Marked missing (Field app)',
            condition: 'good',
          },
        ],
      });
      Alert.alert('Saved', `${asset.assetName || asset.assetTag || assetId} verified.`);
      await load();
    } catch (err: unknown) {
      if (shouldQueueOffline(err)) {
        await savePendingAssetVerification({
          localId: makeLocalId(),
          assetId,
          assetTag: asset.assetTag,
          isPresent,
          notes: isPresent ? 'Verified present (offline)' : 'Marked missing (offline)',
          condition: 'good',
          createdAt: new Date().toISOString(),
          syncStatus: 'pending',
        });
        Alert.alert('Queued offline', 'Will sync on next refresh.');
      } else {
        Alert.alert('Verify failed', extractApiError(err));
      }
    } finally {
      setBusyId(null);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      const sync = await syncPendingAssetVerifications();
      if (sync.synced > 0) Alert.alert('Synced', `${sync.synced} verification(s) uploaded.`);
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Assets"
        subtitle="Critical equipment daily verification"
        onLogout={() => auth?.logout()}
      />
      <View style={styles.searchWrap}>
        <TextInput
          style={styles.search}
          placeholder="Search name or tag…"
          value={query}
          onChangeText={setQuery}
        />
      </View>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={THEME.primary} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.assetId)}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[THEME.primary]} />
          }
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>No critical assets. Sync when online.</Text>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.title}>{item.assetName || 'Asset'}</Text>
              <Text style={styles.meta}>
                {item.assetTag ? `#${item.assetTag}` : `ID ${item.assetId}`}
                {item.location ? ` · ${item.location}` : ''}
              </Text>
              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.btn, styles.present]}
                  disabled={busyId === item.assetId}
                  onPress={() => void verifyOne(item, true)}
                >
                  {busyId === item.assetId ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.btnText}>Present</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btn, styles.missing]}
                  disabled={busyId === item.assetId}
                  onPress={() => void verifyOne(item, false)}
                >
                  <Text style={styles.btnText}>Missing</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.background },
  searchWrap: { paddingHorizontal: 16, paddingTop: 10 },
  search: {
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
  },
  list: { padding: 16, paddingBottom: 40 },
  empty: { textAlign: 'center', color: THEME.textMuted, marginTop: 40 },
  card: {
    backgroundColor: THEME.card,
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  title: { fontSize: 15, fontWeight: '700', color: THEME.text },
  meta: { marginTop: 4, fontSize: 12, color: THEME.textMuted },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  btn: {
    flex: 1,
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: 'center',
  },
  present: { backgroundColor: THEME.success },
  missing: { backgroundColor: THEME.danger },
  btnText: { color: '#fff', fontWeight: '700' },
});

export default AssetVerifyScreen;
