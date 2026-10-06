package storage

import (
	"context"
	"database/sql"
	"embed"
	"errors"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
)

type txKey struct{}
type subjectKey struct{}
type invitationKey struct{}

func Subject(ctx context.Context, subject string) context.Context {
	return context.WithValue(ctx, subjectKey{}, subject)
}
func Invitation(ctx context.Context, hash string) context.Context {
	return context.WithValue(ctx, invitationKey{}, hash)
}
func (d *DB) ForSubject(ctx context.Context, subject string) context.Context {
	return Subject(ctx, subject)
}
func (d *DB) ForInvitation(ctx context.Context, hash string) context.Context {
	return Invitation(ctx, hash)
}

type DB struct{ Pool *pgxpool.Pool }
type Executor interface {
	Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
	Query(context.Context, string, ...any) (pgx.Rows, error)
	QueryRow(context.Context, string, ...any) pgx.Row
}

func Open(ctx context.Context, url string) (*DB, error) {
	p, err := pgxpool.New(ctx, url)
	if err != nil {
		return nil, err
	}
	if err = p.Ping(ctx); err != nil {
		p.Close()
		return nil, err
	}
	return &DB{p}, nil
}
func (d *DB) Within(ctx context.Context, tenant string, fn func(context.Context) error) error {
	if _, ok := ctx.Value(txKey{}).(pgx.Tx); ok {
		return fn(ctx)
	}
	tx, err := d.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, "SELECT set_config('app.tenant_id',$1,true)", tenant); err != nil {
		return err
	}
	subject, _ := ctx.Value(subjectKey{}).(string)
	hash, _ := ctx.Value(invitationKey{}).(string)
	if _, err = tx.Exec(ctx, "SELECT set_config('app.subject',$1,true),set_config('app.invitation_hash',$2,true)", subject, hash); err != nil {
		return err
	}
	if err = fn(context.WithValue(ctx, txKey{}, tx)); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
func (d *DB) Q(ctx context.Context) Executor {
	if tx, ok := ctx.Value(txKey{}).(pgx.Tx); ok {
		return tx
	}
	return d.Pool
}
func Conflict(err error) bool { var p *pgconn.PgError; return errors.As(err, &p) && p.Code == "23505" }
func Migrate(url string, fs embed.FS) error {
	db, err := sql.Open("pgx", url)
	if err != nil {
		return err
	}
	defer db.Close()
	goose.SetBaseFS(fs)
	if err = goose.SetDialect("postgres"); err != nil {
		return err
	}
	return goose.Up(db, "migrations")
}
