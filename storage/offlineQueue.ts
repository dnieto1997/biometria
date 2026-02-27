import AsyncStorage from "@react-native-async-storage/async-storage";

const QUEUE_KEY = "OFFLINE_FACE_QUEUE";

export async function addToQueue(item: any) {
  const queue = JSON.parse(
    (await AsyncStorage.getItem(QUEUE_KEY)) || "[]"
  );

  queue.push(item);

  await AsyncStorage.setItem(
    QUEUE_KEY,
    JSON.stringify(queue)
  );
}

export async function getQueue() {
  return JSON.parse(
    (await AsyncStorage.getItem(QUEUE_KEY)) || "[]"
  );
}

export async function clearQueue() {
  await AsyncStorage.removeItem(QUEUE_KEY);
}
