// Package security contains identity values without HTTP or identity-provider dependencies.
package security

type Principal struct{ Subject, FullName, LastName, FirstName, MiddleName, Phone, Email string }

type PersonName struct{ LastName, FirstName, MiddleName string }
