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
  TextInput,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import ScreenHeader from '../components/ScreenHeader';
import { AuthContext } from '../navigation/AppNavigator';
import { THEME } from '../config/api';
import apiService from '../services/api';
import {
  getCachedReferrals,
  makeLocalId,
  savePendingChemistAction,
  setCachedReferrals,
} from '../services/offlineStore';
import { syncPendingChemistActions } from '../services/syncService';
import { extractApiError, shouldQueueOffline } from '../utils/apiErrorUtils';

const ChemistReferralsScreen: React.FC = () => {
  const auth = useContext(AuthContext);
  const [referrals, setReferrals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [chemistScope, setChemistScope] = useState<any>(null);

  const load = async () => {
    const cached = await getCachedReferrals();
    if (cached.length) setReferrals(cached);
    try {
      try {
        const me = await apiService.getChemistMe();
        setChemistScope(me);
      } catch {
        setChemistScope(null);
      }
      const rows = await apiService.listExternalReferrals(
        search.trim() ? { search: search.trim() } : {}
      );
      setReferrals(rows);
      await setCachedReferrals(rows);
    } catch {
      // offline: keep cache
    }
  };

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load().finally(() => setLoading(false));
    }, [])
  );

  const dispenseItem = async (referral: any, item: any) => {
    const remaining = Math.max(
      0,
      Number(item.quantityPrescribed || item.quantity || 0) - Number(item.quantityPicked || 0)
    );
    const qty = remaining > 0 ? remaining : 1;
    const key = `${referral.referralId}-${item.referralItemId}`;
    setBusyKey(key);
    try {
      await apiService.updateReferralItem(referral.referralId, item.referralItemId, {
        status: 'picked_up',
        quantityPicked: qty,
        chemistNotes: 'Dispensed via IntelliNex Field',
      });
      Alert.alert('Dispensed', `${item.medicationName || item.testName || 'Item'} recorded.`);
      await load();
    } catch (err: unknown) {
      if (shouldQueueOffline(err)) {
        await savePendingChemistAction({
          localId: makeLocalId(),
          referralId: Number(referral.referralId),
          referralItemId: Number(item.referralItemId),
          status: 'picked_up',
          quantityPicked: qty,
          chemistNotes: 'Dispensed via IntelliNex Field (offline)',
          createdAt: new Date().toISOString(),
          syncStatus: 'pending',
        });
        Alert.alert('Queued offline', 'Will sync when you pull to refresh.');
      } else {
        Alert.alert('Dispense failed', extractApiError(err));
      }
    } finally {
      setBusyKey(null);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      const sync = await syncPendingChemistActions();
      if (sync.synced > 0) Alert.alert('Synced', `${sync.synced} dispense action(s) uploaded.`);
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  const filtered = referrals.filter((r) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    const blob = [
      r.referralNumber,
      r.pickupCode,
      r.patientFirstName,
      r.patientLastName,
      r.patientNumber,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return blob.includes(q);
  });

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Chemist"
        subtitle={
          chemistScope?.chemistName
            ? chemistScope.chemistName
            : 'External referrals · offline-capable dispense'
        }
        onLogout={() => auth?.logout()}
      />
      <View style={styles.searchWrap}>
        <TextInput
          style={styles.search}
          placeholder="Search name, pickup code, referral…"
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={() => void load()}
          returnKeyType="search"
        />
      </View>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={THEME.primary} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.referralId)}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[THEME.primary]} />
          }
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>
              No referrals. Sign in as a chemist user, or sync when online.
            </Text>
          }
          renderItem={({ item: referral }) => (
            <View style={styles.card}>
              <Text style={styles.title}>
                {referral.patientFirstName || ''} {referral.patientLastName || ''}
              </Text>
              <Text style={styles.meta}>
                {referral.referralNumber}
                {referral.pickupCode ? ` · code ${referral.pickupCode}` : ''}
              </Text>
              <Text style={styles.status}>{String(referral.status || '').replace(/_/g, ' ')}</Text>
              {(referral.items || []).map((it: any) => {
                const key = `${referral.referralId}-${it.referralItemId}`;
                const done = ['picked_up', 'completed'].includes(String(it.status || ''));
                return (
                  <View key={key} style={styles.itemRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemName}>
                        {it.medicationName || it.testName || it.itemName || `Item #${it.referralItemId}`}
                      </Text>
                      <Text style={styles.meta}>
                        Qty {it.quantityPicked || 0}/{it.quantityPrescribed || it.quantity || '?'} ·{' '}
                        {it.status}
                      </Text>
                    </View>
                    {!done ? (
                      <TouchableOpacity
                        style={styles.dispenseBtn}
                        disabled={busyKey === key}
                        onPress={() => void dispenseItem(referral, it)}
                      >
                        {busyKey === key ? (
                          <ActivityIndicator color="#fff" size="small" />
                        ) : (
                          <Text style={styles.dispenseText}>Dispense</Text>
                        )}
                      </TouchableOpacity>
                    ) : (
                      <Text style={styles.done}>Done</Text>
                    )}
                  </View>
                );
              })}
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
  empty: { textAlign: 'center', color: THEME.textMuted, marginTop: 40, paddingHorizontal: 20 },
  card: {
    backgroundColor: THEME.card,
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  title: { fontSize: 16, fontWeight: '700', color: THEME.text },
  meta: { marginTop: 2, fontSize: 12, color: THEME.textMuted },
  status: { marginTop: 6, fontSize: 12, fontWeight: '600', color: THEME.accent, textTransform: 'capitalize' },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: THEME.border,
    gap: 8,
  },
  itemName: { fontSize: 14, fontWeight: '600', color: THEME.text },
  dispenseBtn: {
    backgroundColor: THEME.success,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    minWidth: 88,
    alignItems: 'center',
  },
  dispenseText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  done: { color: THEME.success, fontWeight: '700', fontSize: 12 },
});

export default ChemistReferralsScreen;
