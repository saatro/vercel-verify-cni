import React, { useState, useEffect } from 'react';
import { Bell, BellOff, Loader2 } from 'lucide-react';

const NotificationStatus = ({ fcmToken }) => {
  const [permission, setPermission] = useState(Notification.permission);

  useEffect(() => {
    if ("permissions" in navigator) {
      navigator.permissions.query({ name: "notifications" }).then((status) => {
        status.onchange = () => setPermission(Notification.permission);
      });
    }
  }, []);

  if (permission === 'denied') {
    return (
      <div className="flex items-center gap-2 px-3 py-2 border rounded-lg bg-red-500/10 border-red-500/20">
        <BellOff className="w-4 h-4 text-red-500" />
        <span className="text-[10px] text-red-200">Notifications bloquées par le navigateur</span>
      </div>
    );
  }

  if (permission === 'granted' && fcmToken) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 border rounded-lg bg-emerald-500/10 border-emerald-500/20">
        <Bell className="w-4 h-4 text-emerald-500" />
        <span className="text-[10px] text-emerald-100">Notifications actives</span>
      </div>
    );
  }

  if (permission === 'granted' && !fcmToken) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 border rounded-lg bg-amber-500/10 border-amber-500/20">
        <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />
        <span className="text-[10px] text-amber-100">Synchronisation push...</span>
      </div>
    );
  }

  return null;
};

export default NotificationStatus;