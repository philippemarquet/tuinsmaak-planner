import { supabase } from './supabaseClient';

const VAPID_PUBLIC_KEY = 'BEWJzKqH9xQxGqPvCLvYqJ8YqYqP9xQxGqPvCLvYqJ8YqYqP9xQxGqPvCLvYqJ8YqYqP9xQxGqPvCLvYqJ8YqYqP'; // Placeholder - wordt vervangen

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    throw new Error('Browser ondersteunt geen notificaties');
  }
  
  if (!('serviceWorker' in navigator)) {
    throw new Error('Browser ondersteunt geen service workers');
  }

  const permission = await Notification.requestPermission();
  return permission;
}

export async function subscribeToPushNotifications(): Promise<PushSubscription | null> {
  try {
    // Registreer service worker
    const registration = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;

    // Vraag om permission
    const permission = await requestNotificationPermission();
    if (permission !== 'granted') {
      throw new Error('Notificatie permissie niet gegeven');
    }

    // Maak push subscription
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
    });

    // Sla subscription op in database
    await savePushSubscription(subscription);

    return subscription;
  } catch (error) {
    console.error('Error subscribing to push notifications:', error);
    throw error;
  }
}

export async function savePushSubscription(subscription: PushSubscription): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Niet ingelogd');

  const subscriptionJson = subscription.toJSON();
  
  const { error } = await supabase.from('push_subscriptions').upsert({
    user_id: user.id,
    endpoint: subscription.endpoint,
    p256dh_key: subscriptionJson.keys?.p256dh || '',
    auth_key: subscriptionJson.keys?.auth || '',
  }, {
    onConflict: 'user_id,endpoint'
  });

  if (error) throw error;
}

export async function unsubscribeFromPushNotifications(): Promise<void> {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    
    if (subscription) {
      await subscription.unsubscribe();
      
      // Verwijder uit database
      const { error } = await supabase
        .from('push_subscriptions')
        .delete()
        .eq('endpoint', subscription.endpoint);
      
      if (error) throw error;
    }
  } catch (error) {
    console.error('Error unsubscribing:', error);
    throw error;
  }
}

export async function isPushNotificationSubscribed(): Promise<boolean> {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      return false;
    }

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return subscription !== null;
  } catch {
    return false;
  }
}
