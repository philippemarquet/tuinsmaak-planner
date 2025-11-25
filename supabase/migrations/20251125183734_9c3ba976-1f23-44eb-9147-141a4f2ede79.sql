-- Update profiles notification_prefs to include weekly digest settings
COMMENT ON COLUMN profiles.notification_prefs IS 'JSON object met notificatie voorkeuren inclusief: 
- email_notifications (boolean)
- remind_sow, remind_plant, remind_harvest, conflict_alerts (boolean)
- weekly_digest (boolean)
- digest_day (0-6, 0=zondag)
- digest_time (HH:MM format, bijv "08:00")';

-- Enable pg_cron extension for scheduling
CREATE EXTENSION IF NOT EXISTS pg_cron;