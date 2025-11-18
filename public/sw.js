// Service Worker for Push Notifications
self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const options = {
      body: data.body || 'Je hebt een nieuwe taak',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: data.data || {},
      tag: data.tag || 'general',
      requireInteraction: false,
    };

    event.waitUntil(
      self.registration.showNotification(data.title || 'Bosgoedt Planner', options)
    );
  } catch (error) {
    console.error('Error showing notification:', error);
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    clients.openWindow(event.notification.data?.url || '/')
  );
});
