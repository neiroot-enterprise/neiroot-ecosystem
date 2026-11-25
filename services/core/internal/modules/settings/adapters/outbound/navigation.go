package outbound

import (
	"context"
	"neiroot/internal/platform/storage"
)

type NavigationRepository struct{ DB *storage.DB }

func (r *NavigationRepository) Read(ctx context.Context, tenant, subject string) (map[string][]string, error) {
	rows, err := r.DB.Q(ctx).Query(ctx, "SELECT list_id,items FROM settings.navigation_orders WHERE tenant_id=$1 AND subject=$2", tenant, subject)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := map[string][]string{}
	for rows.Next() {
		var list string
		var items []string
		if err := rows.Scan(&list, &items); err != nil {
			return nil, err
		}
		result[list] = items
	}
	return result, rows.Err()
}

func (r *NavigationRepository) Save(ctx context.Context, tenant, subject, list string, items []string) error {
	_, err := r.DB.Q(ctx).Exec(ctx, `INSERT INTO settings.navigation_orders(tenant_id,subject,list_id,items) VALUES($1,$2,$3,$4)
		ON CONFLICT(tenant_id,subject,list_id) DO UPDATE SET items=excluded.items`, tenant, subject, list, items)
	return err
}
