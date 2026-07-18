import React, { useCallback, useContext, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import ScreenHeader from '../components/ScreenHeader';
import { AuthContext } from '../navigation/AppNavigator';
import { THEME } from '../config/api';
import { getPendingSubmissions } from '../services/offlineStore';
import { syncPendingSubmissions } from '../services/syncService';
import apiService from '../services/api';
import { DataCollectionSubmission, PendingSubmission } from '../types/dataCollection';

const SubmissionsScreen: React.FC = () => {
  const auth = useContext(AuthContext);
  const [remote, setRemote] = useState<DataCollectionSubmission[]>([]);
  const [pending, setPending] = useState<PendingSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    const localPending = await getPendingSubmissions();
    setPending(localPending);
    try {
      const rows = await apiService.listMySubmissions(50);
      setRemote(rows);
    } catch {
      // keep last remote / empty when offline
    }
  };

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load().finally(() => setLoading(false));
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      const sync = await syncPendingSubmissions();
      if (sync.synced > 0) Alert.alert('Synced', `${sync.synced} visit(s) uploaded.`);
      if (sync.failed > 0) Alert.alert('Sync issues', sync.errors.slice(0, 3).join('\n'));
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  type Row =
    | { kind: 'pending'; data: PendingSubmission }
    | { kind: 'remote'; data: DataCollectionSubmission };

  const rows: Row[] = [
    ...pending.map((p) => ({ kind: 'pending' as const, data: p })),
    ...remote.map((r) => ({ kind: 'remote' as const, data: r })),
  ];

  return (
    <View style={styles.container}>
      <ScreenHeader title="My visits" onLogout={() => auth?.logout()} />
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={THEME.primary} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item, index) =>
            item.kind === 'pending' ? item.data.localId : `r-${item.data.submissionId}-${index}`
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[THEME.primary]} />
          }
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>No visits yet.</Text>}
          renderItem={({ item }) => {
            if (item.kind === 'pending') {
              const p = item.data;
              return (
                <View style={[styles.card, styles.pendingCard]}>
                  <Text style={styles.badge}>OFFLINE QUEUE · {p.status}</Text>
                  <Text style={styles.title}>{p.title}</Text>
                  <Text style={styles.meta}>{p.templateName}</Text>
                  {p.lastError ? <Text style={styles.error}>{p.lastError}</Text> : null}
                </View>
              );
            }
            const s = item.data;
            return (
              <View style={styles.card}>
                <Text style={styles.title}>{s.title || `Submission #${s.submissionId}`}</Text>
                <Text style={styles.meta}>
                  {s.templateName || `Template ${s.templateId}`}
                  {s.visitDate ? ` · ${s.visitDate}` : ''}
                </Text>
                {s.subjectLabel ? <Text style={styles.meta}>{s.subjectLabel}</Text> : null}
              </View>
            );
          }}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.background },
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
  pendingCard: { borderColor: THEME.warning },
  badge: { fontSize: 11, fontWeight: '700', color: THEME.warning, marginBottom: 6 },
  title: { fontSize: 15, fontWeight: '700', color: THEME.text },
  meta: { marginTop: 4, fontSize: 12, color: THEME.textMuted },
  error: { marginTop: 6, fontSize: 12, color: THEME.danger },
});

export default SubmissionsScreen;
