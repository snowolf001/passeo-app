import React from 'react';
import {View, Text, StyleSheet, TouchableOpacity, FlatList} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

type Task = {
  id: string;
  title: string;
  price: string;
  location: string;
};

const MOCK_TASKS: Task[] = [
  {
    id: '1',
    title: 'Help move a couch',
    price: '$40',
    location: 'Glendale',
  },
  {
    id: '2',
    title: 'Snow shoveling',
    price: '$25',
    location: 'Denver',
  },
  {
    id: '3',
    title: 'Pick up groceries',
    price: '$15',
    location: 'Nearby',
  },
];

export default function HomeScreen() {
  const renderItem = ({item}: {item: Task}) => {
    return (
      <TouchableOpacity style={styles.card}>
        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.meta}>
          {item.price} · {item.location}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.header}>Local Tasks</Text>

      <FlatList
        data={MOCK_TASKS}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={{padding: 16}}
      />

      <TouchableOpacity style={styles.fab}>
        <Text style={styles.fabText}>＋</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0F17',
  },
  header: {
    fontSize: 22,
    fontWeight: '600',
    color: '#E5E7EB',
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  card: {
    backgroundColor: '#111827',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },
  meta: {
    color: '#9CA3AF',
    marginTop: 6,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    backgroundColor: '#3B82F6',
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabText: {
    color: '#FFFFFF',
    fontSize: 28,
    marginTop: -2,
  },
});
