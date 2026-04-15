SELECT code, name, description
FROM dbo.roles
WHERE code IN ('PORTAL_ADMIN', 'ADMIN', 'HANDLER', 'SUPER_ADMIN');
