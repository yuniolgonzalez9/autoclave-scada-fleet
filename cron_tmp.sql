select cron.schedule('fleet-ingest-every-minute','* * * * *', $$select net.http_post('https://gjtqyodpgwfvfvkhlhik.supabase.co/functions/v1/fleet-ingest','{}','application/json')$$);
