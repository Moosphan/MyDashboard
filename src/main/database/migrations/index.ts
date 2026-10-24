import type Database from 'better-sqlite3'

interface Migration {
  version: number
  name: string
  up: (db: Database.Database) => void
}

const migrations: Migration[] = [
  {
    version: 1,
    name: '001_initial_schema',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS user_profile (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL DEFAULT 'Dorck',
          avatar_path TEXT,
          bio TEXT,
          github_url TEXT,
          blog_url TEXT,
          social_links TEXT DEFAULT '{}',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS projects (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          description TEXT,
          icon TEXT,
          color TEXT,
          progress INTEGER DEFAULT 0 CHECK(progress >= 0 AND progress <= 100),
          status TEXT CHECK(status IN ('active', 'paused', 'completed', 'archived')) DEFAULT 'active',
          is_focus INTEGER DEFAULT 0,
          start_date DATE,
          target_date DATE,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS tasks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          description TEXT,
          priority TEXT CHECK(priority IN ('high', 'medium', 'low')) DEFAULT 'medium',
          status TEXT CHECK(status IN ('pending', 'in_progress', 'completed', 'cancelled')) DEFAULT 'pending',
          due_date DATE,
          project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
          tags TEXT DEFAULT '[]',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS calendar_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          description TEXT,
          start_time DATETIME NOT NULL,
          end_time DATETIME,
          all_day INTEGER DEFAULT 0,
          color TEXT,
          source TEXT DEFAULT 'local',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS activity_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          date DATE NOT NULL,
          activity_type TEXT NOT NULL,
          duration_minutes INTEGER DEFAULT 0,
          intensity INTEGER DEFAULT 1 CHECK(intensity >= 1 AND intensity <= 4),
          metadata TEXT DEFAULT '{}',
          UNIQUE(date, activity_type)
        );

        CREATE TABLE IF NOT EXISTS portfolio_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          description TEXT,
          thumbnail_path TEXT,
          url TEXT,
          category TEXT,
          tags TEXT DEFAULT '[]',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `)
    },
  },
  {
    version: 2,
    name: '002_writing_tables',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS articles (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL DEFAULT 'Untitled',
          content TEXT,
          file_path TEXT,
          status TEXT CHECK(status IN ('draft', 'editing', 'review', 'published', 'archived')) DEFAULT 'draft',
          category TEXT,
          tags TEXT DEFAULT '[]',
          word_count INTEGER DEFAULT 0,
          cover_image_path TEXT,
          summary TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          published_at DATETIME
        );

        CREATE TABLE IF NOT EXISTS article_publish_records (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
          platform TEXT NOT NULL,
          platform_article_id TEXT,
          platform_url TEXT,
          status TEXT CHECK(status IN ('pending', 'publishing', 'published', 'failed')) DEFAULT 'pending',
          error_message TEXT,
          published_at DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS notes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT,
          content TEXT NOT NULL,
          file_path TEXT,
          category TEXT,
          tags TEXT DEFAULT '[]',
          is_pinned INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS drafts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT,
          content TEXT,
          type TEXT CHECK(type IN ('text', 'link', 'image', 'snippet')) DEFAULT 'text',
          source_url TEXT,
          file_path TEXT,
          tags TEXT DEFAULT '[]',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `)
    },
  },
  {
    version: 3,
    name: '003_media_tables',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS video_assets (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          type TEXT CHECK(type IN ('cover', 'audio', 'presentation', 'other')) NOT NULL,
          file_path TEXT NOT NULL,
          file_size INTEGER,
          file_format TEXT,
          duration_seconds REAL,
          metadata TEXT DEFAULT '{}',
          tags TEXT DEFAULT '[]',
          status TEXT CHECK(status IN ('ready', 'processing', 'draft')) DEFAULT 'ready',
          thumbnail_path TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `)
    },
  },
  {
    version: 4,
    name: '004_insights_tables',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS rss_feeds (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          url TEXT NOT NULL UNIQUE,
          site_url TEXT,
          category TEXT,
          icon_url TEXT,
          last_fetched_at DATETIME,
          is_active INTEGER DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS rss_articles (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          feed_id INTEGER NOT NULL REFERENCES rss_feeds(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          url TEXT NOT NULL,
          author TEXT,
          summary TEXT,
          content TEXT,
          thumbnail_url TEXT,
          published_at DATETIME,
          is_read INTEGER DEFAULT 0,
          is_starred INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS social_accounts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          platform TEXT NOT NULL,
          account_name TEXT NOT NULL,
          account_id TEXT,
          profile_url TEXT,
          api_config TEXT DEFAULT '{}',
          is_active INTEGER DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS social_metrics (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          account_id INTEGER NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
          metric_type TEXT NOT NULL,
          metric_value INTEGER NOT NULL,
          snapshot_date DATE NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(account_id, metric_type, snapshot_date)
        );

        CREATE TABLE IF NOT EXISTS social_content_metrics (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          account_id INTEGER NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
          content_title TEXT,
          content_url TEXT,
          platform_content_id TEXT,
          views INTEGER DEFAULT 0,
          likes INTEGER DEFAULT 0,
          comments INTEGER DEFAULT 0,
          shares INTEGER DEFAULT 0,
          favorites INTEGER DEFAULT 0,
          snapshot_date DATE NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `)
    },
  },
  {
    version: 5,
    name: '005_ai_tables',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS ai_subscriptions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          provider TEXT NOT NULL,
          plan_name TEXT NOT NULL,
          monthly_cost REAL,
          currency TEXT DEFAULT 'USD',
          billing_date INTEGER,
          token_limit INTEGER,
          tokens_used INTEGER DEFAULT 0,
          reset_date DATE,
          is_active INTEGER DEFAULT 1,
          api_key TEXT,
          metadata TEXT DEFAULT '{}',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS ai_tools (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          description TEXT,
          category TEXT CHECK(category IN ('text', 'image', 'code', 'audio', 'video', 'other')),
          provider TEXT,
          url TEXT,
          icon_url TEXT,
          is_custom INTEGER DEFAULT 0,
          usage_count INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `)
    },
  },
  {
    version: 6,
    name: '006_rss_articles_unique_index',
    up: (db) => {
      // Remove duplicate articles (keep the oldest one)
      db.exec(`
        DELETE FROM rss_articles
        WHERE id NOT IN (
          SELECT MIN(id) FROM rss_articles GROUP BY feed_id, url
        )
      `)
      // Add unique index to prevent future duplicates
      db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_rss_articles_feed_url
        ON rss_articles(feed_id, url)
      `)
    },
  },
  {
    version: 7,
    name: '007_ideas_table',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS ideas (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          content TEXT NOT NULL,
          category TEXT DEFAULT 'writing',
          is_pinned INTEGER DEFAULT 0,
          is_private INTEGER DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        )
      `)
    },
  },
  {
    version: 8,
    name: '008_article_highlights',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS article_highlights (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          article_id INTEGER NOT NULL REFERENCES rss_articles(id) ON DELETE CASCADE,
          selected_text TEXT NOT NULL,
          note TEXT,
          color TEXT DEFAULT '#FEC300',
          created_at TEXT DEFAULT (datetime('now'))
        )
      `)
    },
  },
  {
    version: 9,
    name: '009_ai_subscriptions_base_url',
    up: (db) => {
      db.exec(`
        ALTER TABLE ai_subscriptions ADD COLUMN base_url TEXT
      `)
    },
  },
  {
    version: 10,
    name: '010_ai_usage_logs',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS ai_usage_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          subscription_id INTEGER NOT NULL REFERENCES ai_subscriptions(id) ON DELETE CASCADE,
          input_tokens INTEGER DEFAULT 0,
          output_tokens INTEGER DEFAULT 0,
          total_tokens INTEGER DEFAULT 0,
          cost REAL DEFAULT 0,
          model TEXT,
          snapshot_date TEXT DEFAULT (date('now')),
          created_at TEXT DEFAULT (datetime('now'))
        )
      `)
    },
  },
  {
    version: 11,
    name: '011_plugin_registry',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS plugin_registry (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          version TEXT NOT NULL,
          enabled INTEGER DEFAULT 1,
          installed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          metadata TEXT DEFAULT '{}'
        )
      `)
    },
  },
  {
    version: 12,
    name: '012_extend_user_profile',
    up: (db) => {
      db.exec(`
        ALTER TABLE user_profile ADD COLUMN email TEXT
      `)
      db.exec(`
        ALTER TABLE user_profile ADD COLUMN location TEXT
      `)
      db.exec(`
        ALTER TABLE user_profile ADD COLUMN website TEXT
      `)
    },
  },
  {
    version: 13,
    name: '013_moodboard_items',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS moodboard_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          url TEXT NOT NULL,
          description TEXT,
          category TEXT DEFAULT 'general',
          thumbnail_url TEXT,
          rating REAL DEFAULT 0 CHECK(rating >= 0 AND rating <= 5),
          tags TEXT DEFAULT '[]',
          is_pinned INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `)
    },
  },
  {
    version: 14,
    name: '014_project_milestones',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS project_milestones (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          description TEXT,
          due_date DATE,
          status TEXT CHECK(status IN ('pending', 'reached', 'missed')) DEFAULT 'pending',
          reached_at DATETIME,
          sort_order INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `)
      db.exec(`
        ALTER TABLE tasks ADD COLUMN estimated_hours REAL
      `)
      db.exec(`
        ALTER TABLE tasks ADD COLUMN actual_hours REAL
      `)
      db.exec(`
        ALTER TABLE tasks ADD COLUMN parent_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL
      `)
      db.exec(`
        ALTER TABLE tasks ADD COLUMN sort_order INTEGER DEFAULT 0
      `)
      db.exec(`
        ALTER TABLE tasks ADD COLUMN milestone_id INTEGER REFERENCES project_milestones(id) ON DELETE SET NULL
      `)
    },
  },
  {
    version: 15,
    name: '015_social_trending_items',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS social_trending_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          platform TEXT NOT NULL,
          period TEXT NOT NULL CHECK(period IN ('day', 'week', 'month')),
          external_id TEXT NOT NULL,
          title TEXT NOT NULL,
          url TEXT NOT NULL,
          author TEXT,
          published_at DATETIME,
          heat_score REAL NOT NULL DEFAULT 0,
          heat_label TEXT,
          tags TEXT DEFAULT '[]',
          category TEXT,
          summary TEXT,
          raw_metrics TEXT DEFAULT '{}',
          source TEXT NOT NULL,
          fetched_at DATETIME NOT NULL,
          expires_at DATETIME NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(platform, period, external_id)
        );

        CREATE INDEX IF NOT EXISTS idx_social_trending_lookup
        ON social_trending_items(platform, period, heat_score DESC);

        CREATE INDEX IF NOT EXISTS idx_social_trending_expiry
        ON social_trending_items(platform, period, expires_at);

        CREATE TABLE IF NOT EXISTS social_trending_refresh_state (
          platform TEXT NOT NULL,
          period TEXT NOT NULL CHECK(period IN ('day', 'week', 'month')),
          status TEXT NOT NULL,
          message TEXT,
          active_backend TEXT,
          last_fetched_at DATETIME,
          next_refresh_at DATETIME,
          updated_count INTEGER DEFAULT 0,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY(platform, period)
        );
      `)
    },
  },
  {
    version: 16,
    name: '016_social_trending_v2ex_platform',
    up: (db) => {
      db.exec(`
        UPDATE social_trending_items
        SET platform = 'v2ex',
            source = CASE
              WHEN source LIKE 'linuxdo:%' THEN 'v2ex:migrated'
              ELSE source
            END,
            updated_at = CURRENT_TIMESTAMP
        WHERE platform = 'linuxdo';

        UPDATE social_trending_refresh_state
        SET platform = 'v2ex',
            message = 'V2EX hot topics provider is configured.',
            active_backend = 'v2ex-hot',
            updated_at = CURRENT_TIMESTAMP
        WHERE platform = 'linuxdo'
          AND NOT EXISTS (
            SELECT 1 FROM social_trending_refresh_state existing
            WHERE existing.platform = 'v2ex'
              AND existing.period = social_trending_refresh_state.period
          );

        DELETE FROM social_trending_refresh_state WHERE platform = 'linuxdo';
        DELETE FROM social_trending_items WHERE platform = 'v2ex' AND source = 'v2ex:migrated';
      `)
    },
  },
  {
    version: 17,
    name: '017_one_active_focus_project',
    up: (db) => {
      db.exec(`
        UPDATE projects
        SET is_focus = 0
        WHERE status != 'active';

        UPDATE projects
        SET is_focus = 0
        WHERE is_focus = 1
          AND id != COALESCE((
            SELECT id FROM projects
            WHERE status = 'active' AND is_focus = 1
            ORDER BY updated_at DESC, id DESC
            LIMIT 1
          ), -1);

        CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_focus_project
        ON projects(is_focus)
        WHERE is_focus = 1 AND status = 'active';
      `)
    },
  },
  {
    version: 18,
    name: '018_reset_radar_history',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS reset_radar_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          kind TEXT NOT NULL CHECK(kind IN ('reset')),
          occurred_at DATETIME NOT NULL,
          title TEXT NOT NULL,
          detail TEXT NOT NULL,
          source TEXT NOT NULL,
          metadata TEXT DEFAULT '{}',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_reset_radar_history_occurred_at
        ON reset_radar_history(occurred_at DESC);

        CREATE TABLE IF NOT EXISTS reset_radar_account_snapshot (
          id INTEGER PRIMARY KEY CHECK(id = 1),
          plan TEXT,
          limit_reached INTEGER,
          quota_windows TEXT NOT NULL DEFAULT '[]',
          reset_credits TEXT,
          fetched_at DATETIME NOT NULL,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `)
    },
  },
  {
    version: 19,
    name: '019_reset_radar_public_signal_metadata',
    up: (db) => {
      db.exec(`
        ALTER TABLE reset_radar_history ADD COLUMN external_id TEXT;
        ALTER TABLE reset_radar_history ADD COLUMN source_url TEXT;

        CREATE UNIQUE INDEX IF NOT EXISTS idx_reset_radar_history_external_id
        ON reset_radar_history(external_id)
        WHERE external_id IS NOT NULL;
      `)
    },
  },
  {
    version: 20,
    name: '020_reset_radar_reset_type',
    up: (db) => {
      db.exec(`
        ALTER TABLE reset_radar_history ADD COLUMN reset_type TEXT NOT NULL DEFAULT 'unknown'
          CHECK(reset_type IN ('global', 'gift', 'unknown'));
      `)
    },
  },
  {
    version: 21,
    name: '021_backfill_reset_radar_types',
    up: (db) => {
      db.exec(`
        UPDATE reset_radar_history
        SET reset_type = 'gift'
        WHERE reset_type = 'unknown'
          AND lower(title || ' ' || detail) LIKE '%banked reset%';

        UPDATE reset_radar_history
        SET reset_type = 'global'
        WHERE reset_type = 'unknown'
          AND (
            lower(title || ' ' || detail) LIKE '%all chatgpt%'
            OR lower(title || ' ' || detail) LIKE '%all codex%'
            OR lower(title || ' ' || detail) LIKE '%all paid users%'
            OR lower(title || ' ' || detail) LIKE '%global reset%'
          );
      `)
    },
  },
  {
    version: 22,
    name: '022_reset_radar_subscription_expiry',
    up: (db) => {
      db.exec(`
        ALTER TABLE reset_radar_account_snapshot ADD COLUMN subscription_expires_at DATETIME
      `)
    },
  },
  {
    version: 23,
    name: '023_research_materials',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS research_materials (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          source_type TEXT,
          source_id INTEGER,
          title TEXT NOT NULL,
          excerpt TEXT,
          url TEXT,
          author TEXT,
          tags TEXT NOT NULL DEFAULT '[]',
          project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
          article_id INTEGER REFERENCES articles(id) ON DELETE SET NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_research_materials_source
        ON research_materials(source_type, source_id)
        WHERE source_type IS NOT NULL AND source_id IS NOT NULL;

        CREATE INDEX IF NOT EXISTS idx_research_materials_project_id
        ON research_materials(project_id);

        CREATE INDEX IF NOT EXISTS idx_research_materials_article_id
        ON research_materials(article_id);
      `)
    },
  },
  {
    version: 24,
    name: '024_research_briefs',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS research_briefs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          objective TEXT NOT NULL,
          content TEXT NOT NULL,
          material_ids TEXT NOT NULL,
          provider TEXT,
          model TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_research_briefs_created_at
        ON research_briefs(created_at DESC);
      `)
    },
  },
  {
    version: 25,
    name: '025_article_content_variants_and_receipts',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS article_content_variants (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
          platform TEXT NOT NULL,
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(article_id, platform)
        );

        CREATE TABLE IF NOT EXISTS article_publish_receipts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
          variant_id INTEGER REFERENCES article_content_variants(id) ON DELETE SET NULL,
          platform TEXT NOT NULL,
          status TEXT NOT NULL CHECK(status IN ('prepared', 'published', 'failed')) DEFAULT 'prepared',
          destination_url TEXT,
          note TEXT,
          prepared_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          published_at DATETIME,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_article_content_variants_article_id
        ON article_content_variants(article_id, updated_at DESC);

        CREATE INDEX IF NOT EXISTS idx_article_publish_receipts_article_id
        ON article_publish_receipts(article_id, prepared_at DESC);
      `)
    },
  },
  {
    version: 26,
    name: '026_article_publish_metric_snapshots',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS article_publish_metric_snapshots (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          receipt_id INTEGER NOT NULL REFERENCES article_publish_receipts(id) ON DELETE CASCADE,
          views INTEGER NOT NULL DEFAULT 0 CHECK(views >= 0),
          likes INTEGER NOT NULL DEFAULT 0 CHECK(likes >= 0),
          comments INTEGER NOT NULL DEFAULT 0 CHECK(comments >= 0),
          shares INTEGER NOT NULL DEFAULT 0 CHECK(shares >= 0),
          favorites INTEGER NOT NULL DEFAULT 0 CHECK(favorites >= 0),
          snapshot_date DATE NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(receipt_id, snapshot_date)
        );

        CREATE INDEX IF NOT EXISTS idx_article_publish_metric_snapshots_receipt
        ON article_publish_metric_snapshots(receipt_id, snapshot_date DESC);
      `)
    },
  },
  {
    version: 27,
    name: '027_focus_sessions',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS focus_sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
          started_at DATETIME NOT NULL,
          ended_at DATETIME,
          duration_minutes INTEGER NOT NULL DEFAULT 0 CHECK(duration_minutes >= 0),
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_focus_sessions_one_active
        ON focus_sessions((1))
        WHERE ended_at IS NULL;

        CREATE INDEX IF NOT EXISTS idx_focus_sessions_task_id
        ON focus_sessions(task_id, started_at DESC);
      `)
    },
  },
  {
    version: 28,
    name: '028_ai_action_plans',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS ai_action_plans (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          objective TEXT NOT NULL,
          summary TEXT NOT NULL,
          provider TEXT,
          model TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS ai_action_proposals (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          plan_id INTEGER NOT NULL REFERENCES ai_action_plans(id) ON DELETE CASCADE,
          action_type TEXT NOT NULL CHECK(action_type = 'create_task'),
          title TEXT NOT NULL,
          description TEXT,
          priority TEXT NOT NULL CHECK(priority IN ('high', 'medium', 'low')),
          due_date DATE,
          tags TEXT NOT NULL DEFAULT '[]',
          status TEXT NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed', 'applied', 'dismissed')),
          task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
          resolved_at DATETIME
        );

        CREATE INDEX IF NOT EXISTS idx_ai_action_plans_project_id
        ON ai_action_plans(project_id, created_at DESC);

        CREATE INDEX IF NOT EXISTS idx_ai_action_proposals_plan_id
        ON ai_action_proposals(plan_id, id);
      `)
    },
  },
  {
    version: 29,
    name: '029_focus_session_planned_duration',
    up: (db) => {
      db.exec(`
        ALTER TABLE focus_sessions ADD COLUMN planned_duration_minutes INTEGER
          CHECK(planned_duration_minutes IS NULL OR planned_duration_minutes > 0);

        UPDATE focus_sessions
        SET planned_duration_minutes = (
          SELECT CAST(ROUND(tasks.estimated_hours * 60) AS INTEGER)
          FROM tasks
          WHERE tasks.id = focus_sessions.task_id
        )
        WHERE ended_at IS NULL
          AND planned_duration_minutes IS NULL
          AND task_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM tasks
            WHERE tasks.id = focus_sessions.task_id
              AND tasks.estimated_hours IS NOT NULL
              AND tasks.estimated_hours > 0
          );
      `)
    },
  },
  {
    version: 30,
    name: '030_reset_radar_account_identity',
    up: (db) => {
      db.exec(`
        ALTER TABLE reset_radar_account_snapshot ADD COLUMN email TEXT;
        ALTER TABLE reset_radar_account_snapshot ADD COLUMN name TEXT;
      `)
    },
  },
  {
    version: 31,
    name: '031_notification_center_messages',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS notification_center_messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          notification_key TEXT NOT NULL UNIQUE,
          title TEXT NOT NULL,
          body TEXT NOT NULL,
          route TEXT,
          created_at DATETIME NOT NULL,
          read_at DATETIME
        );

        CREATE INDEX IF NOT EXISTS idx_notification_center_unread
        ON notification_center_messages(read_at, created_at DESC);
      `)
    },
  },
  {
    version: 32,
    name: '032_reset_radar_usage_samples',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS reset_radar_usage_samples (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          observed_at DATETIME NOT NULL,
          quota_windows TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_reset_radar_usage_samples_observed_at
        ON reset_radar_usage_samples(observed_at ASC);
      `)
    },
  },
  {
    version: 33,
    name: '033_voiceover_profiles_jobs',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS voice_profiles (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          current_revision INTEGER NOT NULL,
          revisions_json TEXT NOT NULL,
          deleted_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS voice_jobs (
          id TEXT PRIMARY KEY,
          client_request_id TEXT NOT NULL UNIQUE,
          request_json TEXT NOT NULL,
          state TEXT NOT NULL,
          phase TEXT NOT NULL,
          revision INTEGER NOT NULL DEFAULT 1,
          attempt_id TEXT NOT NULL,
          audio_asset_id INTEGER UNIQUE REFERENCES video_assets(id) ON DELETE SET NULL,
          error TEXT,
          elapsed_seconds REAL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_voice_jobs_created ON voice_jobs(created_at DESC);
      `)
    },
  },
  {
    version: 34,
    name: '034_video_creation_workflow',
    up: (db) => {
      db.exec(`
        CREATE TABLE video_projects (
          id TEXT PRIMARY KEY, title TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
          archived INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE TABLE video_workflow_revisions (
          id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES video_projects(id),
          stage TEXT NOT NULL, version INTEGER NOT NULL, payload TEXT NOT NULL, dependencies TEXT NOT NULL,
          status TEXT NOT NULL, approved_at TEXT, note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL,
          UNIQUE(project_id, stage, version)
        );
        CREATE TABLE video_workflow_requests (
          request_id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES video_projects(id), fingerprint TEXT NOT NULL
        );
        CREATE TABLE video_workflow_jobs (
          id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES video_projects(id), stage TEXT NOT NULL,
          request_id TEXT NOT NULL UNIQUE, expected_revision INTEGER NOT NULL, executor TEXT NOT NULL, input_fingerprint TEXT NOT NULL,
          state TEXT NOT NULL, phase TEXT NOT NULL, error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE TABLE video_workflow_files (
          id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES video_projects(id),
          path TEXT NOT NULL UNIQUE, sha256 TEXT NOT NULL, size INTEGER NOT NULL, mime TEXT NOT NULL
        );
        CREATE TABLE video_workflow_publications (
          id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES video_projects(id), platform TEXT NOT NULL,
          revision_id TEXT NOT NULL REFERENCES video_workflow_revisions(id), metadata TEXT NOT NULL,
          export_path TEXT NOT NULL, url TEXT, created_at TEXT NOT NULL, published_at TEXT
        );
        CREATE INDEX idx_video_workflow_revisions ON video_workflow_revisions(project_id, stage, version DESC);
        CREATE INDEX idx_video_workflow_jobs ON video_workflow_jobs(project_id, created_at DESC);
      `)
    },
  },
  {
    version: 35,
    name: '035_workflow_audio_progress',
    up: (db) => {
      db.exec('ALTER TABLE video_workflow_jobs ADD COLUMN audio_progress TEXT')
    },
  },
  {
    version: 36,
    name: '036_workflow_motion_and_templates',
    up: (db) => {
      db.exec(`
        ALTER TABLE video_workflow_jobs ADD COLUMN kind TEXT NOT NULL DEFAULT 'generation';
        ALTER TABLE video_workflow_jobs ADD COLUMN motion_plan TEXT;
        CREATE TABLE video_style_templates (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL,
          source_project_id TEXT NOT NULL REFERENCES video_projects(id),
          source_revision_id TEXT NOT NULL REFERENCES video_workflow_revisions(id),
          payload TEXT NOT NULL, created_at TEXT NOT NULL
        );
      `)
    },
  },
  {
    version: 37,
    name: '037_workflow_scene_operations',
    up: (db) => {
      db.exec('ALTER TABLE video_workflow_jobs ADD COLUMN operation TEXT')
    },
  },
]

export function runMigrations(db: Database.Database): void {
  // Create migrations table if not exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)

  const applied = db.prepare('SELECT version FROM _migrations').all() as { version: number }[]
  const appliedVersions = new Set(applied.map((r) => r.version))

  const insertMigration = db.prepare('INSERT INTO _migrations (version, name) VALUES (?, ?)')

  for (const migration of migrations) {
    if (!appliedVersions.has(migration.version)) {
      db.transaction(() => {
        migration.up(db)
        insertMigration.run(migration.version, migration.name)
      })()
      console.log(`Applied migration: ${migration.name}`)
    }
  }
}
