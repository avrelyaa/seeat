import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type ScrollViewInstance } from 'react-native';

const hours = Array.from({ length: 24 }, (_, index) => index);
const minutes = Array.from({ length: 60 }, (_, index) => index);
const wheelRow = 44;

function TimeWheel({ label, values, value, onChange }: { label: string; values: number[]; value: number; onChange: (value: number) => void }) {
  const ref = useRef<ScrollViewInstance>(null);
  useEffect(() => { ref.current?.scrollTo({ y: value * wheelRow, animated: false }); }, [value]);
  function settle(offset: number) {
    const index = Math.max(0, Math.min(values.length - 1, Math.round(offset / wheelRow)));
    if (values[index] !== value) onChange(values[index]);
  }
  return <View style={s.wheelColumn}>
    <Text style={s.wheelLabel}>{label}</Text>
    <View style={s.wheelFrame}>
      <View pointerEvents="none" style={s.wheelHighlight} />
      <ScrollView ref={ref} style={s.wheel} contentContainerStyle={s.wheelContent} snapToInterval={wheelRow} decelerationRate="fast" nestedScrollEnabled showsVerticalScrollIndicator={false} onMomentumScrollEnd={event => settle(event.nativeEvent.contentOffset.y)} onScrollEndDrag={event => { if (!event.nativeEvent.velocity?.y) settle(event.nativeEvent.contentOffset.y); }}>
        {values.map(number => <Pressable key={number} accessibilityRole="button" accessibilityLabel={`${label} ${String(number).padStart(2, '0')}`} onPress={() => { ref.current?.scrollTo({ y: number * wheelRow, animated: true }); onChange(number); }} style={s.wheelItem}>
          <Text style={[s.wheelNumber, number === value && s.wheelNumberSelected]}>{String(number).padStart(2, '0')}</Text>
        </Pressable>)}
      </ScrollView>
    </View>
  </View>;
}

function startOfDay(date: Date) {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  return day;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function initialChoice() {
  const next = new Date();
  next.setHours(next.getHours() + 2, next.getMinutes(), 0, 0);
  return next;
}

export function formatSchedule(value?: string) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function SchedulePicker({
  label, value, onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const selected = value && !Number.isNaN(Date.parse(value)) ? new Date(value) : null;
  const [week, setWeek] = useState(() => selected
    ? Math.max(0, Math.floor((startOfDay(selected).getTime() - startOfDay(new Date()).getTime()) / 604800000))
    : 0);
  const choice = selected || initialChoice();
  const days = Array.from({ length: 7 }, (_, index) => addDays(startOfDay(new Date()), week * 7 + index));

  function chooseDay(day: Date) {
    const next = new Date(day);
    next.setHours(choice.getHours(), choice.getMinutes(), 0, 0);
    onChange(next.toISOString());
  }

  function chooseHour(hour: number) {
    const next = new Date(choice);
    next.setHours(hour, choice.getMinutes(), 0, 0);
    onChange(next.toISOString());
  }

  function chooseMinute(minute: number) {
    const next = new Date(choice);
    next.setMinutes(minute, 0, 0);
    onChange(next.toISOString());
  }

  return <View style={s.block}>
    <View style={s.heading}>
      <Text style={s.label}>{label}</Text>
      {value ? <Pressable onPress={() => { onChange(''); setExpanded(false); }}><Text style={s.clear}>Clear</Text></Pressable> : null}
    </View>
    <Pressable accessibilityRole="button" onPress={() => setExpanded(!expanded)} style={s.trigger}>
      <Text style={[s.value, !value && s.placeholder]}>{value ? formatSchedule(value) : 'Add date & time'}</Text>
      <Text style={s.chevron}>{expanded ? '−' : '+'}</Text>
    </Pressable>
    {expanded && <View style={s.panel}>
      <View style={s.weekBar}>
        <Text style={s.subLabel}>DAY</Text>
        <View style={s.weekActions}>
          <Pressable accessibilityLabel="Previous week" disabled={week === 0} onPress={() => setWeek(week - 1)} style={s.arrow}>
            <Text style={[s.arrowText, week === 0 && s.disabled]}>‹</Text>
          </Pressable>
          <Text style={s.weekText}>{week === 0 ? 'This week' : 'Week ' + (week + 1)}</Text>
          <Pressable accessibilityLabel="Next week" disabled={week >= 7} onPress={() => setWeek(week + 1)} style={s.arrow}>
            <Text style={[s.arrowText, week >= 7 && s.disabled]}>›</Text>
          </Pressable>
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.days}>
        {days.map((day, index) => <Pressable key={day.toISOString()} onPress={() => chooseDay(day)} style={[s.day, selected && sameDay(selected, day) && s.selected]}>
          <Text style={[s.dayName, selected && sameDay(selected, day) && s.selectedText]}>{week === 0 && index === 0 ? 'Today' : day.toLocaleDateString('en-US', { weekday: 'short' })}</Text>
          <Text style={[s.dayNumber, selected && sameDay(selected, day) && s.selectedText]}>{day.getDate()}</Text>
        </Pressable>)}
      </ScrollView>
      <View style={s.timeWheels}>
        <TimeWheel label="Hour" values={hours} value={choice.getHours()} onChange={chooseHour} />
        <Text style={s.timeColon}>:</Text>
        <TimeWheel label="Minute" values={minutes} value={choice.getMinutes()} onChange={chooseMinute} />
      </View>
    </View>}
  </View>;
}

const s = StyleSheet.create({
  block: { marginTop: 18 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  label: { color: '#34172B', fontWeight: '700', fontSize: 13 },
  clear: { color: '#BB425C', fontSize: 13, fontWeight: '700' },
  trigger: { minHeight: 54, backgroundColor: '#FFFDFB', borderWidth: 1, borderColor: '#EEDCDE', borderRadius: 15, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  value: { color: '#34172B', fontSize: 14, fontWeight: '600' },
  placeholder: { color: '#8D7D83', fontWeight: '400' },
  chevron: { color: '#BB425C', fontSize: 22, fontWeight: '400' },
  panel: { backgroundColor: '#FFF6F4', borderRadius: 18, paddingVertical: 16, marginTop: 8, borderWidth: 1, borderColor: '#F5E5E5' },
  weekBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 15 },
  subLabel: { color: '#8D6977', fontSize: 10, fontWeight: '800', letterSpacing: 1.6 },
  weekActions: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  arrow: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  arrowText: { color: '#BB425C', fontSize: 25 },
  disabled: { opacity: .25 },
  weekText: { color: '#684D5A', fontSize: 12, minWidth: 62, textAlign: 'center' },
  days: { gap: 8, paddingHorizontal: 15, paddingTop: 11 },
  day: { minWidth: 56, paddingVertical: 8, paddingHorizontal: 7, borderRadius: 12, alignItems: 'center', backgroundColor: '#FFFFFF' },
  selected: { backgroundColor: '#3E1732' },
  selectedText: { color: '#FFFFFF' },
  dayName: { color: '#8E727B', fontSize: 11, fontWeight: '600' },
  dayNumber: { color: '#3E1732', fontSize: 18, fontWeight: '800', marginTop: 2 },
  timeWheels: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, marginTop: 20, paddingHorizontal: 15 },
  wheelColumn: { alignItems: 'center', width: 92 },
  wheelLabel: { color: '#8D6977', fontSize: 11, fontWeight: '800', marginBottom: 8 },
  wheelFrame: { width: 92, height: 132, borderRadius: 14, overflow: 'hidden', backgroundColor: '#FFFFFF' },
  wheel: { flex: 1 },
  wheelContent: { paddingVertical: wheelRow },
  wheelHighlight: { position: 'absolute', left: 4, right: 4, top: wheelRow, height: wheelRow, borderRadius: 10, backgroundColor: '#FDECEF' },
  wheelItem: { height: wheelRow, alignItems: 'center', justifyContent: 'center' },
  wheelNumber: { color: '#9C8793', fontSize: 18, fontWeight: '600' },
  wheelNumberSelected: { color: '#3B1831', fontWeight: '900' },
  timeColon: { color: '#3B1831', fontSize: 25, fontWeight: '800', marginTop: 18 },
});
