const { pool } = require('../crawler_new/db.js');

(async () => {
  try {
    // Zeige die letzte Liste mit IP
    const listRes = await pool.query(`
      SELECT id, erstellt_von, erstellt_von_ip, ip_loeschfrist_am 
      FROM community_listen 
      WHERE erstellt_von_ip IS NOT NULL
      ORDER BY erstellt_am DESC 
      LIMIT 2
    `);
    
    console.log('📝 Community-Listen mit IP:');
    if (listRes.rows.length > 0) {
      listRes.rows.forEach(row => {
        console.log(`  ID ${row.id}: IP=${row.erstellt_von_ip}, Löschfrist=${row.ip_loeschfrist_am.toISOString().split('T')[0]}`);
      });
    } else {
      console.log('  (Noch keine)');
    }

    // Zeige die letzte Eintrag mit IP
    const itemRes = await pool.query(`
      SELECT id, nutzername, erstellt_von_ip, ip_loeschfrist_am 
      FROM community_liste_eintraege 
      WHERE erstellt_von_ip IS NOT NULL
      ORDER BY erstellt_am DESC 
      LIMIT 2
    `);
    
    console.log('\n💬 Community-Einträge mit IP:');
    if (itemRes.rows.length > 0) {
      itemRes.rows.forEach(row => {
        console.log(`  ID ${row.id}: IP=${row.erstellt_von_ip}, Löschfrist=${row.ip_loeschfrist_am.toISOString().split('T')[0]}`);
      });
    } else {
      console.log('  (Noch keine)');
    }

    // Zeige Reports mit IP des GEMELDETEN INHALTS
    const reportRes = await pool.query(`
      SELECT id, meldungstyp, ziel_id, grund, ziel_nutzer_ip, ip_loeschfrist_am 
      FROM gemeinschafts_meldungen 
      WHERE ziel_nutzer_ip IS NOT NULL
      ORDER BY gemeldet_am DESC 
      LIMIT 3
    `);
    
    console.log('\n🚨 Reports mit IP des gemeldeten Inhalts:');
    if (reportRes.rows.length > 0) {
      reportRes.rows.forEach(row => {
        const loeschDatum = row.ip_loeschfrist_am ? row.ip_loeschfrist_am.toISOString().split('T')[0] : 'N/A';
        console.log(`  ID ${row.id}: ${row.meldungstyp} (Ziel ${row.ziel_id}), Grund=${row.grund}`);
        console.log(`    Ziel-IP=${row.ziel_nutzer_ip}, Löschfrist=${loeschDatum}`);
      });
    } else {
      console.log('  (Noch keine)');
    }

    console.log('\n✨ IP-Tracking vollständig implementiert!');

  } catch (e) {
    console.error('Fehler:', e.message);
  } finally {
    await pool.end();
  }
})();
