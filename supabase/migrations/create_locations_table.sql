-- Locations Table
-- Stores countries and locations available for incident reporting

CREATE TABLE IF NOT EXISTS locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code TEXT NOT NULL,
  country_name TEXT NOT NULL,
  display_order INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES handlers(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES handlers(id) ON DELETE SET NULL,

  -- Ensure unique country codes
  CONSTRAINT unique_country_code UNIQUE (country_code)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_locations_country_code ON locations(country_code);
CREATE INDEX IF NOT EXISTS idx_locations_active ON locations(active);
CREATE INDEX IF NOT EXISTS idx_locations_display_order ON locations(display_order);

-- Add trigger to update updated_at
CREATE OR REPLACE FUNCTION update_locations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_locations_updated_at
  BEFORE UPDATE ON locations
  FOR EACH ROW
  EXECUTE FUNCTION update_locations_updated_at();

-- Insert default locations (matching available languages: NL, EN, FR, DE)
INSERT INTO locations (country_code, country_name, display_order, active) VALUES
  ('NL', 'Nederland', 1, TRUE),
  ('GB', 'United Kingdom', 2, TRUE),
  ('FR', 'France', 3, TRUE),
  ('DE', 'Deutschland', 4, TRUE)
ON CONFLICT (country_code) DO NOTHING;

-- Add comment
COMMENT ON TABLE locations IS 'Stores available countries for incident location selection';
