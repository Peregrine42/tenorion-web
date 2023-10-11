# frozen_string_literal: true

module SignInHelpers
  def sign_in_with(username, password, create: false)
    if create
      existing = User.find_by(username:)
      User.create(username:, password:) unless existing
    end

    visit root_path
    fill_in 'Username', with: username
    fill_in 'Password', with: password
    click_button 'Sign in'
  end
end
