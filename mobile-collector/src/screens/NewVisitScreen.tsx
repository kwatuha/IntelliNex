import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import ChecklistFormRenderer from '../components/ChecklistFormRenderer';
import ScreenHeader from '../components/ScreenHeader';
import { THEME } from '../config/api';
import apiService from '../services/api';
import {
  getCachedTemplates,
  getVisitDraft,
  savePendingSubmission,
  setVisitDraft,
} from '../services/offlineStore';
import { makeLocalId } from '../services/syncService';
import { validateChecklistAnswers, normalizeAnswersForSubmit } from '../utils/checklistValidation';
import { uploadPendingPhotosInAnswers } from '../utils/attachmentUpload';
import { extractApiError, shouldQueueOffline } from '../utils/apiErrorUtils';
import { DataCollectionTemplate, VisitSubjectType } from '../types/dataCollection';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const NewVisitScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const templateId = Number(route.params?.templateId);
  const templateNameParam = route.params?.templateName as string | undefined;

  const [template, setTemplate] = useState<DataCollectionTemplate | null>(null);
  const [visitDate, setVisitDate] = useState(todayIso());
  const [title, setTitle] = useState('');
  const [subjectLabel, setSubjectLabel] = useState('');
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [cachedTemplates, draft] = await Promise.all([getCachedTemplates(), getVisitDraft()]);
      let tpl = cachedTemplates.find((t) => t.templateId === templateId) || null;
      if (!tpl) {
        tpl = await apiService.getTemplate(templateId);
      }
      setTemplate(tpl);
      setTitle(draft?.title || `${tpl?.name || templateNameParam || 'Visit'} — ${todayIso()}`);
      setVisitDate(draft?.visitDate || todayIso());
      setSubjectLabel(draft?.subjectLabel || '');
      if (draft?.answers && draft.templateId === templateId) {
        setAnswers(draft.answers);
      }
    } catch (e: any) {
      Alert.alert('Could not load form', e?.message || 'Try syncing checklists first.');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [navigation, templateId, templateNameParam]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!templateId) return;
    const t = setTimeout(() => {
      void setVisitDraft({
        templateId,
        subjectType: 'standalone' as VisitSubjectType,
        subjectLabel,
        visitDate,
        title,
        answers,
        savedAt: new Date().toISOString(),
      });
    }, 500);
    return () => clearTimeout(t);
  }, [templateId, subjectLabel, visitDate, title, answers]);

  const submit = async () => {
    if (!template) return;
    const missing = validateChecklistAnswers(template.structure, answers);
    if (missing.length) {
      Alert.alert('Incomplete form', `Required: ${missing.slice(0, 5).join(', ')}`);
      return;
    }
    setSubmitting(true);
    try {
      const normalized = normalizeAnswersForSubmit(template.structure, answers);
      const withPhotos = await uploadPendingPhotosInAnswers(normalized);
      await apiService.createSubmission({
        templateId: template.templateId,
        subjectType: 'standalone',
        subjectLabel: subjectLabel.trim() || undefined,
        visitDate,
        title: title.trim() || template.name,
        answers: withPhotos,
      });
      await setVisitDraft(null);
      Alert.alert('Submitted', 'Visit uploaded successfully.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err: unknown) {
      if (shouldQueueOffline(err)) {
        await savePendingSubmission({
          localId: makeLocalId(),
          templateId: template.templateId,
          templateName: template.name,
          subjectType: 'standalone',
          subjectLabel: subjectLabel.trim() || undefined,
          visitDate,
          title: title.trim() || template.name,
          answers,
          createdAt: new Date().toISOString(),
          status: 'pending',
        });
        await setVisitDraft(null);
        Alert.alert('Saved offline', 'Will upload when you sync from Checklists.', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      } else {
        Alert.alert('Submit failed', extractApiError(err));
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !template) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={THEME.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader
        title={template.name}
        rightAction={{ label: 'Back', onPress: () => navigation.goBack() }}
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Visit title</Text>
        <TextInput style={styles.input} value={title} onChangeText={setTitle} />
        <Text style={styles.label}>Visit date (YYYY-MM-DD)</Text>
        <TextInput style={styles.input} value={visitDate} onChangeText={setVisitDate} />
        <Text style={styles.label}>Subject / site (optional)</Text>
        <TextInput
          style={styles.input}
          value={subjectLabel}
          onChangeText={setSubjectLabel}
          placeholder="Facility, village, patient ref…"
        />
        <ChecklistFormRenderer
          structure={template.structure}
          value={answers}
          onChange={setAnswers}
        />
        <TouchableOpacity style={styles.submit} onPress={submit} disabled={submitting}>
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitText}>Submit visit</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 16, paddingBottom: 40 },
  label: { fontSize: 13, fontWeight: '600', color: THEME.textMuted, marginBottom: 6, marginTop: 8 },
  input: {
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
    color: THEME.text,
    marginBottom: 4,
  },
  submit: {
    marginTop: 20,
    backgroundColor: THEME.primary,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});

export default NewVisitScreen;
