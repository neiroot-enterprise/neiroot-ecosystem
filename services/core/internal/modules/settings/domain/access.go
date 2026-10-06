package domain

type Role string

const (
	Owner Role = "owner"
	Admin Role = "admin"
	User  Role = "user"
)

func (r Role) CanManage() bool  { return r == Owner || r == Admin }
func (r Role) Assignable() bool { return r == Admin || r == User }

type Tenant struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Role Role   `json:"role"`
}
type Grant struct {
	EmployeeID      string `json:"employeeId"`
	Subject         string `json:"-"`
	Email           string `json:"-"`
	Role            Role   `json:"role"`
	InvitationState string `json:"invitationState,omitempty"`
}
